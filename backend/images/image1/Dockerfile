# Use Python 3.11 slim image for smaller size
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Copy the Python script
COPY main.py .

# Make the script executable
RUN chmod +x main.py

# Set the default command to run the script
CMD ["python", "-u", "main.py"]