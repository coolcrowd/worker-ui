# Worker UI
Worker interface to use with [CrowdControl](https://github.com/coolcrowd/object-service).

## Installation

### Native

```bash
# Install gulp as global binary
sudo npm install -g gulp

# Clone git repository and change directory
git clone https://github.com/coolcrowd/worker-ui && cd worker-ui

# Install dependencies using npm
npm install

# Build default version (human readable output)
gulp production

# Configure your web server to serve ./build (see development section for alternative)
```

### Using Docker

```bash
# Clone git repository and change directory
git clone https://github.com/coolcrowd/worker-ui && cd worker-ui

docker build -t worker-ui .
docker run -ti -v $PWD/build:/app/build worker-ui

# Build is now ready in $PWD/build
```

## Development

During development, use `gulp` without any arguments to enter development mode.
Files are automatically watched and rebuilt on change.
Updated stylesheets will be injected automatically, no page reload required.

To host the files from `./build` use `gulp browserSync`.

## Usage

The worker UI is bundled in the `worker_ui.js` and exports the object `WorkerUI`.
See [here](src/index.html) for sample usage.
