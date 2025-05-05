# Node.js Dependency Visualizer

An interactive web application for visualizing Node.js dependency graphs from package-lock.json and yarn.lock files.

![Dependency Graph Screenshot](screenshot.png)

## Features

- Upload and parse package-lock.json or yarn.lock files
- Interactive visualization using D3.js force-directed graph
- Color-coded dependencies based on type (production, development, peer, optional)
- Highlight version conflicts to identify potential issues
- Search functionality to find specific packages
- Zoom, pan and drag controls for easy navigation
- Export visualizations as SVG or PNG
- Accessible alternative table view

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
