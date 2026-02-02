import sys
import time


def main():
    print("Starting 30-second wait...")

    # Wait for 30 seconds
    for i in range(30, 0, -1):
        print(f"Waiting... {i} seconds remaining")
        # emit some messages to stderr so tests can capture both stdout and stderr
        if i in (30, 20, 10, 1):
            print(f"STDERR: checkpoint at {i} seconds remaining", file=sys.stderr)
        time.sleep(1)

    print("30 seconds have passed! Exiting...")
    print("STDERR: finished countdown without errors", file=sys.stderr)


if __name__ == "__main__":
    main()
