#!/usr/bin/env python3
import sys
import time

# main file
def main():
    print("Starting test application...", flush=True)

    for i in range(30):
        # Print to stdout every second
        print(f"[STDOUT] Second {i+1}/30", flush=True)

        # Print to stderr every 10 seconds
        if (i + 1) % 10 == 0:
            print(f"[STDERR] 10-second mark at {i+1} seconds", file=sys.stderr, flush=True)

        time.sleep(1)

    print("Test application finished!", flush=True)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nApplication stopped by user", file=sys.stderr, flush=True)
        sys.exit(1)
