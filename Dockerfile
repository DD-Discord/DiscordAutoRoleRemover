FROM node:latest

# Create the directory!
RUN mkdir -p /roleautoremover
WORKDIR /roleautoremover

# Copy and Install our bot
COPY package.json /roleautoremover
COPY package-lock.json /roleautoremover
RUN npm install

# Our precious bot
COPY . /roleautoremover

# Start me!
CMD ["node", "index.js"]
