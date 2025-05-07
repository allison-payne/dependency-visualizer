# Node.js Dependency Visualizer

An interactive web application for visualizing Node.js dependency graphs from package-lock.json, pnpm-lock.yml and yarn.lock files.

![Dependency Graph Screenshot](screenshot.png)

## Features

- Interactive visualization of Node.js dependency graphs
- Support for multiple lockfile formats:
  - package-lock.json (npm)
  - yarn.lock (Yarn)
  - pnpm-lock.yaml (pnpm)
- Force-directed graph layout using D3.js
- Zoom, pan, and drag interactions
- Detailed dependency information on hover
- Filter and search functionality

## Supported Lock Files

- **package-lock.json** (NPM v2/v3 and v7+ formats)
- **yarn.lock**
- **pnpm-lock.yaml** (Coming soon)

## Installation

Clone the repository and install dependencies:

```bash
# Clone the repository
git clone https://github.com/yourusername/dependency-visualizer.git
cd dependency-visualizer

# Install dependencies
npm install
# or
pnpm install
# or
yarn install
```

## Development

To start the development server:

```bash
npm run dev
# or
pnpm dev
# or
yarn dev
```

Open your browser and navigate to [http://localhost:3000](http://localhost:3000) to see the application.

## Building for Production

To create an optimized production build:

```bash
npm run build
# or
pnpm build
# or
yarn build
```

## Deployment

After building the project, you can serve the production build:

```bash
npm run start
# or
pnpm start
# or
yarn start
```

## Usage

1. Upload your lockfile (package-lock.json, yarn.lock, or pnpm-lock.yaml) using the file selector
2. Explore your dependency graph using mouse or touch interactions:
   - Zoom: Mouse wheel / pinch gesture
   - Pan: Click and drag on empty space / touch and drag
   - Move nodes: Click and drag nodes / touch and drag nodes
   - View details: Hover over nodes to see dependency information

## License

[MIT](LICENSE)
