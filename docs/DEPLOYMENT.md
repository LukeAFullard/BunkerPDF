# Deployment Guide

This document outlines how to deploy the application. While we currently use GitHub Pages for development testing, **Cloudflare Pages** is highly recommended for production due to its fast global edge network and generous unmetered bandwidth (crucial for serving large WASM assets).

## Deploying to Cloudflare Pages (Recommended for Production)

Cloudflare Pages provides seamless integration with GitHub and automatically handles SPA routing and fast asset delivery.

### Prerequisites
1. A Cloudflare account (the free tier is completely sufficient).
2. The code pushed to a GitHub repository.

### Step-by-Step Instructions

1. **Log in to Cloudflare:**
   Navigate to your Cloudflare dashboard and select **Workers & Pages** from the left-hand sidebar.

2. **Create a New Project:**
   Click the **Create application** button, then select the **Pages** tab. Click **Connect to Git**.

3. **Connect your Repository:**
   - Authorize Cloudflare to access your GitHub account.
   - Select the repository containing this application.
   - Click **Begin setup**.

4. **Configure the Build Settings:**
   Fill in the project details. Cloudflare might auto-detect the framework, but ensure the settings are as follows:
   * **Project name:** (Choose your preferred name)
   * **Production branch:** `main` (or your preferred branch)
   * **Framework preset:** `None` or `Create React App`
   * **Build command:** `npm run build`
   * **Build output directory:** `dist`

   *(Note: Vite builds into the `dist` directory by default).*

5. **Advanced Settings (Headers):**
   *(Optional but recommended if you encounter WASM loading issues in the future).*
   Our application uses Vite and WebAssembly. Sometimes cross-origin isolation is required for advanced memory management (like `SharedArrayBuffer`).
   If needed later, you can add a `public/_headers` file to your repository with the following content:
   ```text
   /*
     Cross-Origin-Opener-Policy: same-origin
     Cross-Origin-Embedder-Policy: require-corp
   ```

6. **Deploy:**
   Click **Save and Deploy**. Cloudflare will clone your repository, run the build command, and deploy the `dist` folder to its edge network.

7. **Review:**
   Once the build completes, Cloudflare will provide a `*.pages.dev` URL where your application is live. Every time you push code to your `main` branch, Cloudflare will automatically trigger a new deployment.

---

## Deploying to GitHub Pages (Development)

A GitHub Action is already configured in the repository (`.github/workflows/deploy.yml`) to deploy to GitHub Pages for dev testing.

1. Ensure GitHub Actions are enabled in your repository settings (**Settings > Actions > General**).
2. Ensure GitHub Pages is configured to deploy from GitHub Actions (**Settings > Pages > Source: GitHub Actions**).
3. Any push to the `main` branch will automatically build and deploy to your GitHub Pages URL.
## Enterprise Air-Gapped Deployment (Docker)

For enterprise environments that require strict data isolation and zero external network calls, BunkerPDF can be deployed as an air-gapped Docker container.

### Prerequisites
- Docker installed on the host machine.

### Building the Image
Run the following command from the root of the repository to build the Docker image:

```bash
docker build -t bunkerpdf-enterprise .
```

### Running the Container
Start the container and map it to your desired port (e.g., port 8080):

```bash
docker run -d -p 8080:80 --name bunkerpdf bunkerpdf-enterprise
```

The application will be accessible at `http://localhost:8080` (or the IP of the host machine).

### Important Notes for Air-Gapped Deployments
- The custom `nginx.conf` included in the repository automatically sets the required `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers necessary for WebAssembly features to function securely.
- Since the application processes everything client-side using edge AI and WASM, no data ever leaves the user's browser, satisfying strict compliance and security requirements.
