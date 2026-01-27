import time

def main():
    print("Starting 30-second wait...")

    # Wait for 30 seconds
    for i in range(30, 0, -1):
        print(f"Waiting... {i} seconds remaining")
        time.sleep(1)

    print("30 seconds have passed! Exiting...")

if __name__ == "__main__":
    main()
