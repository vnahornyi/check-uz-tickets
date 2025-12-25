FROM mcr.microsoft.com/playwright:latest

# Dev-mode Dockerfile based on Playwright image (browsers + deps included)
WORKDIR /usr/src/app

# Install production + dev deps for development use inside container
COPY package*.json ./
RUN npm ci

# Copy sources (in dev we'll mount the host workspace over this)
COPY . .

ENV NODE_ENV=development

# Expose bot port and inspector port for remote debugging
EXPOSE 3000 9229

# Default command runs dev server with hot-reload
CMD ["npm", "run", "dev"]
