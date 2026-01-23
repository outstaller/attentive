# Use a lightweight Node.js base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package.json and install dependencies
# We copy only package.json first to leverage Docker cache
COPY package.json ./
RUN npm install --production

# Copy the server code
COPY server.js ./

# Expose the port the app runs on
EXPOSE 3000

# Define environment variables with defaults
ENV PORT=3000

# Start the server
CMD ["npm", "start"]
