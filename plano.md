# Plano de implementação do sistema de filas

Nov 9, 2026 · @Gustavo José Leite Cordeiro

Trocar o despacho por slot do `runner` por um sistema hierárquico de três filas com políticas configuráveis, cujo modelo está na seção seguinte, em cinco fases que deixam o orq funcionando ao fim de cada uma. A fase 1 já entrega a linha de base para a avaliação; a justiça entre usuários chega na fase 3.

## Modelo

O sistema distribui tarefas de vários usuários entre computadores idênticos, de forma online (as tarefas chegam ao longo do tempo) e não clarividente (a duração de uma tarefa é desconhecida até ela terminar). Cada computador roda várias tarefas ao mesmo tempo, limitado por CPU e memória.

**Entidades.** U é o conjunto de usuários e C o de computadores. Cada usuário u submete lotes b, e cada lote é um conjunto de tarefas Jb, não necessariamente iguais. u(j) é o dono da tarefa j. Cada computador c tem capacidade de memória Cr(c) e de CPUs Cc(c); cada tarefa declara Rr(j) e Rc(j). Os instantes de submissão, início e fim são τsub, τini e τfim; daí o tempo de espera Wj = τini − τsub e o de serviço Sj = τfim − τini.

**Restrições.** Qc(t) são as tarefas atribuídas a c no instante t (esperando ou executando) e Ec(t) ⊆ Qc(t) as que executam. Uma tarefa está atribuída a no máximo um computador, e só a um computador do seu conjunto elegível M(j) ⊆ C, que o usuário define no lote (todos os computadores, se ele não restringir). Formalmente, xjc(t) = 0 para todo c ∉ M(j). Com margens de segurança εr, εc ≥ 0 reservadas em cada computador, a todo instante:

```latex
\sum_{j \in E_c(t)} R_r(j) \le C_r(c) - \varepsilon_r \qquad \sum_{j \in E_c(t)} R_c(j) \le C_c(c) - \varepsilon_c
```

Só o que executa consome recurso; o que espera na fila da máquina não. Uma tarefa que não cabe em nenhum computador, mesmo vazio, é rejeitada na submissão. As margens existem para que nenhuma máquina sature: em saturação, interferências do sistema operacional e do runtime de contêineres alteram o desempenho medido, e rodadas do mesmo experimento deixam de ser comparáveis.

**Filas.** Três níveis, cada um com sua política:

1. **Fila de submissão** de cada usuário: suas tarefas pendentes. Política Pu, a ordem de atendimento dentro do usuário.
2. **Fila intermediária**: tarefas já retiradas das filas de submissão, ainda sem computador. Política Pm, que decide qual tarefa sai das filas e para qual computador vai.
3. **Fila de execução** de cada computador: tarefas atribuídas a ele que esperam recurso, Qc(t) \\ Ec(t). Política Pc, a ordem em que são promovidas à execução.

**Políticas disponíveis** em qualquer nível:

| Política | Regra |
| --- | --- |
| FIFO | Ordem de chegada |
| FIFO-skip | Ordem de chegada, pulando quem não cabe agora (first-fit, sem reserva para a cabeça da fila) |
| LCFS | A mais recente primeiro |
| SIRO | Aleatória |
| PQ | Maior escore s(j, t) primeiro |
| Best-Fit | Entre as que cabem, a que deixa menor sobra |
| Weighted Best-Fit | Best-Fit com peso extra para quem espera há mais tempo (aging) |

As três de encaixe dependem do recurso livre de um computador, então se aplicam naturalmente a Pm e Pc. Em Pu, usam o recurso livre do cluster inteiro.

**Seleção: PQ por s(j, t), com a medida de T̂u escolhida pelo admin.** A seleção aplica PQ às cabeças das filas de submissão, ou seja, à primeira tarefa de cada usuário segundo Pu, e retira a de maior escore. A justiça entra pelo termo ω4 · T̂u(t), e as variantes da literatura diferem só em como a parcela do usuário é medida:

| Medida de T̂u | Definição | Base |
| --- | --- | --- |
| DRF | Parcela dominante **atual**: o máximo, entre CPU e memória, da fração da capacidade útil que as tarefas do usuário em execução ocupam agora | Algoritmo 1 de Ghodsi et al. (2011) |
| Weighted DRF | Como o DRF, com si = max\_j ui,j / wi,j; peso wi,j por usuário e recurso, definido pelo admin (padrão 1) | Seção 4.3 do mesmo artigo |
| Fair-share com decaimento | Parcela dominante **histórica**, com cada instante pesando 2^(−idade/h), lida de `user_usage` | Fair-share do Slurm e prioridade de usuário do HTCondor |
| Asset Fairness | Soma das parcelas de CPU e memória em vez do máximo; só para comparação, pois viola o incentivo ao compartilhamento (teoremas 1 e 2) | Seção 5.1 do mesmo artigo |

Configurações típicas, todas expressas pelos mesmos pesos:

- **DRF puro:** medida DRF, ω4 = −1 e os demais pesos em zero.
- **Fair-share puro:** medida histórica, ω4 = −1 e os demais em zero.
- **Justiça com aging:** qualquer medida, ω4 < 0 e ω3 > 0. Quem consumiu muito perde prioridade, mas não espera para sempre.
- **Linhas de base:** FIFO e SIRO continuam disponíveis na seleção, ignorando T̂u.

O CEEI (seção 5.2) fica de fora: exige resolver uma otimização sobre as demandas de todos os usuários, supõe recursos divisíveis e não é à prova de estratégia.

No DRF original, o cluster é tratado como um único conjunto de recursos (a tarefa cabe se C + Di ≤ R) e não há escolha de máquina. O próprio artigo deixa como trabalho futuro reduzir a fragmentação sem perder a justiça e tratar restrições de alocação, como preferência de máquina (seção 9.1). No modelo, isso é a etapa de alocação e o conjunto M(j).

**Na alocação há duas escolhas distintas:** a ordem em que as tarefas da intermediária são consideradas (ordem de chegada à intermediária, ou o escore via PQ) e, para cada tarefa, a máquina (política de encaixe dentro de M(j)). O escore compara tarefas entre si; o encaixe compara máquinas para uma tarefa.

**Política de alocação Tetris** (Grandl et al., SIGCOMM 2014). Para uma tarefa j, cada máquina elegível c recebe um escore de alinhamento, o produto escalar entre a demanda normalizada da tarefa e o recurso livre normalizado da máquina:

```latex
a(j,c) = \hat{R}_c(j) \cdot \hat{F}_c(c) + \hat{R}_r(j) \cdot \hat{F}_r(c)
```

em que F̂c(c) e F̂r(c) são a CPU e a memória livres de c (já descontadas as margens ε), normalizadas pela capacidade de c. A tarefa vai para a máquina de maior alinhamento, o que coloca tarefas pesadas em CPU onde sobra CPU e reduz a fragmentação. O artigo acrescenta um parâmetro de justiça f ∈ \[0, 1\]: só as tarefas da fração (1 − f) de usuários mais atrasados em justiça podem ser alocadas; f = 0 é empacotamento puro, valores maiores pesam mais a justiça. No Maestro, f é configurável pelo admin (padrão 0, já que a justiça principal acontece na seleção).

**Base teórica de M(j): Choosy** (Ghodsi et al., EuroSys 2013). Generaliza o DRF para tarefas com restrições de máquina (*constrained max-min fairness*): cada usuário recebe o máximo que consegue nas máquinas que pode usar, sem que um usuário restrito seja prejudicado nem prejudique os outros além do necessário. É a referência para justificar que a seleção continue justa mesmo com `machines` no `maestro.toml`. Na implementação, a consequência prática é: se a cabeça do usuário escolhido não tem máquina elegível com espaço, a seleção passa ao próximo usuário em vez de bloquear.

As referências Tetris e Choosy foram citadas de memória e precisam ser conferidas antes de entrar na tese.

**Escore.** Para as políticas por prioridade (maior é melhor):

```latex
s(j,t) = \omega_1 \hat{R}_c(j) + \omega_2 \hat{R}_r(j) + \omega_3 \hat{w}_j(t) + \omega_4 \hat{T}_{u(j)}(t)
```

- R̂c(j) = Rc(j) / max Cc(c) e R̂r(j) = Rr(j) / max Cr(c): requisitos normalizados pela maior máquina.
- ŵj(t) = (t − τsub) / H: espera normalizada por um horizonte H > 0.
- T̂u(t) = Tu(t) / Σ Tu′(t): parcela relativa do usuário, segundo a medida que o admin escolher (ver Seleção, abaixo). Na medida histórica, Tu(t) é a parcela dominante de consumo com decaimento: para cada recurso (CPU e memória), soma-se o consumo das tarefas do usuário (Rc·tempo ou Rr·tempo), cada instante pesando 2^(−idade/h) com meia-vida h; divide-se pela capacidade útil do cluster naquele recurso, Σ(C(c) − ε); e fica o maior dos dois valores.
- ω3 > 0 dá aging; ω4 < 0 penaliza quem já consumiu mais (fair-share, generalizado para vários recursos pelo DRF de Ghodsi et al.); ω1, ω2 < 0 favorecem tarefas pequenas, positivos favorecem as grandes.

**Métricas que o código precisa permitir calcular.** Espera média Wq = E\[Wj\], tempo no sistema Ws = Wq + E\[S\], utilização de CPU e de RAM no tempo, bounded slowdown BSLDj = max((Wj + Sj) / max(Sj, θ), 1) e o índice de Jain sobre uma medida por usuário. Todas saem de τsub, τini, τfim, Rc, Rr e do dono de cada tarefa, desde que esses instantes sejam gravados corretamente.

## Ponto de partida

O que o `maestro-orq` faz hoje (commit `c141d93`), e onde cada ponto toca a teoria:

| Hoje no código | Consequência | Na teoria |
| --- | --- | --- |
| Uma goroutine por máquina chama `ClaimLine` enquanto `ativas < Slots` | A máquina decide sozinha qual linha pega; não há visão global | Pm precisa ver todos os usuários e todas as máquinas |
| `ClaimLine` ordena por `run_id, line` | FIFO por experimento: um experimento grande segura todos os outros | É a linha de base FIFO/FIFO/FIFO |
| `machines.slots` conta linhas | CPU e RAM da linha são aplicados ao container, mas não entram na decisão | Restrições (2) e (3) com Cc, Cr, εc, εr |
| `run_lines.cpus` e `memory` | Já existem por linha | Rc(j) e Rr(j) |
| `run_machines` restringe as máquinas de um run | Cada linha tem um conjunto de máquinas permitidas | Falta no modelo: M(j) ⊆ C |
| `ensureImage` roda dentro de `start`, em série por máquina | Uma cópia de imagem longa trava os outros starts da máquina | Justifica a fila de execução |
| `started_at` é gravado no claim | Mede o claim, não o início do container | τ\_ini errado para Wj e BSLD |
| τ\_sub vem de `runs.created_at` | Todas as linhas de um run chegam juntas | Correto: lote com release date única |

## Nomes para discutir

Recomendo manter `run` e `line` no código, porque API, CLI e view já usam esses nomes, e fazer o mapeamento uma vez na tese. As mudanças reais são três: `slots` sai, entram dois estados novos e `started_at` muda de sentido.

| Modelo | Código hoje | Proposta | Alternativas |
| --- | --- | --- | --- |
| Lote b | `run` | manter |  |
| Tarefa j | `line` (`run_lines`) | manter |  |
| Fila de submissão do usuário | linhas `queued` | manter `queued`, agrupado por `runs.user_id` |  |
| Fila intermediária | não existe | estado `staged` | `selected`, `admitted` |
| Fila de execução da máquina | não existe (`starting` é transitório) | estado `assigned`, com `machine` preenchido | `placed`, `bound` |
| Cc(c), Cr(c) | `slots` | `cpus`, `memory` na máquina, lidos do `podman info` | informados pelo admin |
| εc, εr | não existe | `reserve_cpus`, `reserve_memory` | `margin_*`, `headroom_*` |
| τ\_ini | `started_at`, gravado no claim | `started_at` gravado em `SetLineRunning` |  |
| (métricas por nível) | não existe | `staged_at`, `assigned_at` |  |
| Pu, Pm, Pc | não existe | pacote `internal/sched`; o `runner` vira só executor | `internal/queue` |

**O ponto que mexe na tese:** Pm hoje faz duas coisas, escolher de qual usuário sai a próxima tarefa e escolher a máquina. No código, são duas funções diferentes com entradas diferentes. Duas saídas:

1. Manter três políticas na tese e dizer que Pm tem duas etapas, seleção (`queued` → `staged`) e alocação (`staged` → `assigned`). Esta é a escolhida: o modelo continua com três políticas.
2. Separar em quatro políticas (Pu, Ps, Pa, Pc). Mais limpo, mas muda a descrição do modelo na tese.

## Fluxo completo

Uma tarefa passa por três decisões (seleção, alocação, promoção) e por uma checagem na entrada; cada decisão tem seu conjunto de políticas, escolhido pelo admin.

&#91;embedded content: fluxo completo · 3 decisões e as políticas de cada uma\]

A seta tracejada à direita é o laço de justiça: o consumo de cada tarefa terminada entra no histórico do usuário e muda a ordem das próximas seleções.

## Arquitetura alvo

Cada fila é um valor da coluna `run_lines.status`, e cada decisão de política é uma transição gravada numa transação. Nada de tabela de fila separada: o SQLite continua sendo a única fonte de verdade, e a recuperação após restart segue de graça.

&#91;embedded content: estados de uma linha · 3 filas, 3 decisões\]

A seleção e a alocação são as duas metades de Pm. Pu decide a ordem dentro de `queued` de um usuário; Pc decide a ordem dentro de `assigned` de uma máquina.

**Três regras que seguram o desenho:**

- **Puxar, nunca empurrar.** `queued` → `staged` só acontece se `staged` está abaixo da capacidade (padrão: 2 × máquinas ativas, configurável pelo admin). Sem esse limite, tudo escorre para a intermediária na submissão e a justiça do nível 1 some.
- **Um passo central decide, as goroutines executam.** No `tick`, uma única função lê o estado, roda as três políticas e grava as transições numa transação. As goroutines por máquina ficam só com o lento: copiar imagem, criar, inspecionar, coletar. Isso acaba com a corrida entre máquinas no `ClaimLine`.
- **Núcleo puro.** O passo central recebe um retrato do estado e devolve a lista de transições, sem SQL nem SSH dentro. O mesmo código roda depois num simulador de eventos discretos, para comparar políticas sob cargas sintéticas sem ocupar o cluster.

Esboço da interface:

```go
// internal/sched
type Snapshot struct {
    Now      time.Time
    Queued   map[int64][]Task // por usuário, já na ordem de Pu
    Staged   []Task
    Machines []Machine        // capacidade, reserva, uso em Ec(t), fila assigned
    Usage    map[int64]float64 // T_u(t) com decaimento
}

type Move struct {
    Task   TaskID
    To     string // staged | assigned | starting
    Machine string
}

func Step(s Snapshot, p Policies) []Move
```

## Fases

Cinco fases, cada uma terminável e testável sozinha. Ao fim de cada fase o orq roda em produção sem regressão; os testes seguem o padrão do repo (SQLite em memória e miniredis).

### Fase 1: capacidade no lugar de slots

O orq passa a respeitar as restrições de CPU e memória, ainda com a ordem atual. Isso já é a linha de base FIFO da avaliação.

- [ ] Migração `00014`: `machines.cpus`, `machines.memory` (MB), `machines.reserve_cpus`, `machines.reserve_memory`.
- [ ] Ler CPUs e memória do `podman info` ao adicionar a máquina e no check de status; o admin só informa as reservas.
- [ ] Em `serve`, trocar `len(active) < Slots` por "a próxima linha cabe em Cc − εc e Cr − εr, somando `cpus` e `memory` das linhas `starting` e `running`".
- [ ] Na criação do run, rejeitar linhas que não cabem em nenhuma máquina elegível, mesmo vazia.
- [ ] Mover a gravação de `started_at` do `ClaimLine` para o `SetLineRunning`.
- [ ] Remover `slots` da tabela e ajustar `api/machines.go`, `maestro top` e a view.

### Fase 2: núcleo `internal/sched` e passo central

A decisão sai das goroutines por máquina e vai para uma função pura chamada no `tick`. Com políticas FIFO, o comportamento é idêntico ao da fase 1.

- [ ] Tipos `Snapshot`, `Move`, `Machine`, `Task` e a função `Step(Snapshot, Policies) []Move`, sem SQL, SSH ou relógio real.
- [ ] Interface única de ordenação, usada pelos três níveis: `Pick(cands []Task, free Resources, now time.Time) (int, bool)`. O `free` é o do cluster em Pu e o da máquina em Pm e Pc.
- [ ] No `tick`: montar o `Snapshot` a partir do banco, chamar `Step`, aplicar os `Move` numa transação, e só então disparar as goroutines, que agora apenas executam linhas já marcadas `starting`.
- [ ] Remover `ClaimLine` e `CountClaimableLines`.
- [ ] Teste de equivalência: para um mesmo cenário, FIFO/FIFO/FIFO produz a mesma sequência de starts que o código antigo.

### Fase 3: as filas intermediária e de execução

- [ ] Migração: estados `staged` e `assigned` em `run_lines`, colunas `staged_at` e `assigned_at`, índice por `(status, machine)`.
- [ ] Seleção: enquanto `staged` estiver abaixo da capacidade, aplicar Pm às cabeças das filas de submissão (a primeira linha de cada usuário segundo Pu) e mover a escolhida para `staged`.
- [ ] Alocação: para cada linha `staged`, na ordem de Pm, escolher uma máquina elegível (`run_machines`) com menos de k linhas `assigned` e onde ela caiba vazia; gravar `assigned` e `machine`.
- [ ] Promoção: em cada máquina, aplicar Pc às linhas `assigned` com o recurso livre dela e mover as que cabem para `starting`.
- [ ] Pré-cópia: a goroutine da máquina chama `ensureImage` para linhas `assigned`, não só em `start`.
- [ ] Casos de borda: máquina removida devolve suas `assigned` para `staged`; run cancelado leva `queued`, `staged` e `assigned` direto a `cancelled`; restart mantém `staged` e `assigned` como estão.
- [ ] Expor os estados novos na API, no `maestro top` e na view.

### Fase 4: políticas e escore

- [ ] Medidas de T̂u para a seleção por PQ: DRF (parcela dominante instantânea, calculada sobre as linhas `starting` e `running`) e fair-share com decaimento (sobre o histórico em `user_usage`). Na fila do DRF, se a próxima tarefa do usuário escolhido não cabe em nenhuma máquina, passar ao próximo usuário, como no caso discreto do artigo.

* [ ] Política de alocação Tetris: escore de alinhamento a(j, c) e parâmetro de justiça f configurável (padrão 0).
* [ ] Weighted DRF e Asset Fairness como medidas de T̂u; peso por usuário na tela de admin (padrão 1).

- [ ] Implementar as sete políticas sobre a interface da fase 2. SIRO com semente configurável, para que uma rodada possa ser repetida.
- [ ] Escore s(j, t) com pesos ω1 a ω4 e horizonte H configuráveis.
- [ ] Tu(t) calculado a partir das linhas terminadas (`cpus × (finished_at − started_at)`) mais as que estão rodando, como parcela dominante com meia-vida h, lido do histórico de uso abaixo.
- [ ] Configuração de Pu, Pm, Pc, capacidade da intermediária, k e pesos no pacote `setting`, editável pelo admin, lida a cada `tick`.
- [ ] Registrar em cada linha a configuração de políticas vigente quando ela foi selecionada, para a análise saber sob qual configuração cada tarefa rodou.

**Histórico de uso por usuário.** Uma tabela `user_usage` (usuário, início do balde de 1 hora, CPU·s, MB·s), alimentada pelo `tick` a partir das linhas em execução. Ela serve a duas coisas: Tu(t) vira uma soma ponderada sobre os baldes, sem varrer todas as linhas, e o usuário passa a ver quanto consumiu ao longo do tempo.

**Configurações do admin**, todas no pacote `setting`, lidas a cada `tick`, com os padrões:

| Configuração | Padrão |
| --- | --- |
| Pu, Pm (seleção), Pm (alocação), Pc | FIFO em todas (linha de base) |
| Capacidade da fila intermediária | 2 × máquinas ativas |
| Profundidade k da fila de execução | 3 |
| Pesos ω1, ω2, ω3, ω4 | 0, 0, 0, 0 |
| Horizonte H do aging | a definir |
| Meia-vida h do consumo | 7 dias |
| Semente do SIRO | fixa, configurável |
| εc, εr | por máquina, na tela da máquina |

### Fase 5: simulador e métricas

- [ ] `cmd/sim`: lê uma carga (chegada, dono, CPU, memória, duração), avança um relógio de eventos discretos e chama o mesmo `sched.Step`; a duração fica escondida do escalonador.
- [ ] Saída por tarefa: τsub, `staged_at`, `assigned_at`, τini, τfim, máquina, dono.
- [ ] Um pacote de métricas único (Wq, Ws, utilização por recurso, BSLD, Jain) que lê tanto a saída do simulador quanto um export das linhas reais.
- [ ] Endpoint ou comando de CLI para exportar as linhas de um período, para rodar as mesmas métricas sobre o cluster de verdade.

## Impacto em cada repositório

A mudança atravessa os quatro repositórios em dois pontos: `slots` some e aparecem dois estados de linha. O risco maior é o segundo, porque o conjunto de estados ativos `queued, starting, running` está escrito à mão em vários lugares, e uma linha `staged` ou `assigned` seria tratada como terminada.

Os estados novos aparecem na API como status de linha (`staged`, `assigned`), e cada linha traz também um campo `active`, para que CLI e view parem de repetir a lista de estados ativos. O histórico de uso também atravessa os três: o orq expõe `GET /usage` (o usuário vê o seu, o admin vê todos), o CLI ganha `maestro usage` e a view, um gráfico por usuário.

### maestro-orq

- [ ] Queries com a lista de ativos escrita à mão em `runs.sql` (contagem de ativas por run, `CountActiveLinesOfBuild`, `CountLinesNeedingBuildOnMachine`, cancelamento): incluir `staged` e `assigned`. O cancelamento hoje só pega `queued`.
- [ ] API de máquinas (`api/machines.go`): sai `slots`, entram `cpus`, `memory` (descobertos, só leitura), `reserve_cpus`, `reserve_memory`.
- [ ] Endpoint de métricas: `busy`/`queued` por slot viram CPU e memória alocadas em Ec(t), mais a contagem de linhas `assigned` da máquina.
- [ ] Endpoint novo `GET /queue`: os três níveis agregados, quantas linhas cada usuário tem em cada um e a parcela de consumo T̂u. Usuário comum vê os próprios números e os totais; admin vê todos.
- [ ] Configuração das políticas pelo pacote `setting` já existente, exposta na API de settings.
- [ ] Swagger (`docs/`) regenerado.

### maestro-cli

- [ ] `maestroapi`: tipos de máquina e de métricas com os campos novos; comentários de status de linha atualizados.
- [ ] `cmd/runs.go`: o filtro de status (linha 135) ganha `staged` e `assigned`. Linhas 243 e 412 tratam como final tudo que não é `queued` nem `running`: confirmar que o status do run continua só nesses dois, ou o `--watch` para cedo.
- [ ] `maestro machines list`: coluna `SLOTS` vira `CPUS`, `MEMORY` e reserva.
- [ ] `maestro top` (`cmd/top.go` e `tui/top.go`): `SlotsInUse` ("2/4 +3") vira alocação de recurso, algo como `6/14 cpu · 20/30G +1`, e o detalhe da máquina mostra a fila de execução dela.
- [ ] Comando novo `maestro queue`: onde estão as minhas linhas nos três níveis e qual minha parcela de uso. É o que dá ao usuário a sensação de justiça.
- [ ] Se houver CLI de admin, comando para ver e trocar as políticas.

### maestro-view

- [ ] `MachinesAdmin.vue`: o campo "Slots (containers at once)" vira as duas reservas, e o cartão da máquina mostra CPUs e memória descobertas no lugar de "N slots".
- [ ] `RunsDrive.vue`: `ACTIVE` (linha 25), a lista de status (linha 192) e o botão de cancelar (linha 335) ganham os estados novos, com um rótulo legível para cada um.
- [ ] Página ou painel de fila: os três níveis e a parcela de cada usuário, lendo `GET /queue`.
- [ ] Tela de admin para as políticas, pesos, k e capacidade da intermediária.

### maestro-template

- [ ] `maestro.toml`: documentar `cpus` e `memory`, que hoje existem no orq mas não aparecem no template. Com o escalonador por recurso, são eles que decidem onde e quando a linha roda, e uma linha maior que qualquer máquina é rejeitada.
- [ ] Exemplo com `env` e com valores que fazem sentido para o `main.py` de demonstração.
- [ ] README: uma linha explicando que linhas de usuários diferentes são intercaladas com justiça, e que pedir menos recurso faz a linha caber mais cedo.
- [ ] O README cita um branch `knapsack` que não existe no remoto; vale atualizar junto.

## Decisões

Decididas por Gus em 9/11/2026, exceto onde indicado.

| Decisão | Resultado |
| --- | --- |
| Máquinas permitidas por run | Entram no modelo como M(j), restrição xjc = 0 para c ∉ M(j) |
| Pm com duas etapas ou quatro políticas | Duas etapas de Pm (seleção e alocação); o modelo mantém três políticas |
| Destino de `slots` | Removido |
| Unidade de justiça | Usuário |
| Decaimento de Tu(t) | Meia-vida configurável, mais histórico de uso por usuário |
| Tu em CPU·s ou parcela dominante | Parcela dominante (CPU e memória) |
| Capacidade da intermediária | 2 × máquinas ativas por padrão, configurável pelo admin |
| Profundidade k | 3 por padrão, configurável pelo admin |
| Exposição dos estados novos | Status de linha na API (`staged`, `assigned`) mais campo `active` |
| Combinações a avaliar | Em aberto, brainstorm em thread separada |
| Métricas de avaliação | Em aberto, brainstorm em thread separada |

Ainda sem valor: o horizonte H do aging. Uma referência natural é a duração típica de uma tarefa no laboratório, que só os dados de uso vão mostrar.
