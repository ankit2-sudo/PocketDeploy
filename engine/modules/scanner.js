const fs = require('fs');
const path = require('path');

// [L5] Safe file reader — checks for symlinks before reading
function safeReadFileSync(filePath, encoding) {
  const stat = fs.lstatSync(filePath);
  if (stat.isSymbolicLink()) {
    console.warn(`[Scanner] Skipping symlink: ${filePath}`);
    return null;
  }
  return fs.readFileSync(filePath, encoding);
}

/**
 * Scans a cloned repo and detects the project type, language,
 * and the exact commands needed to install, build, and start the app.
 */
function detectProject(repoPath) {
  const files = fs.readdirSync(repoPath);

  // [M9] Warn and clean up .env files from cloned repos
  const envPath = path.join(repoPath, '.env');
  let envVarsDetected = false;
  if (fs.existsSync(envPath)) {
    envVarsDetected = true;
    console.warn(`[Scanner] WARNING: .env file detected in cloned repo at ${envPath}. ` +
      'Secrets should be configured via the app environment variables UI, not committed to repos.');
    // Remove .env to prevent accidental secret exposure on disk
    try {
      fs.unlinkSync(envPath);
      console.warn('[Scanner] Removed .env file from cloned repo.');
    } catch (err) {
      console.warn(`[Scanner] Failed to remove .env: ${err.message}`);
    }
  }

  // ── Node.js ──────────────────────────────────────────────
  if (files.includes('package.json')) {
    try {
      // [L5] Use safe reader to avoid symlink attacks
      const pkgContent = safeReadFileSync(path.join(repoPath, 'package.json'), 'utf8');
      if (!pkgContent) {
        return {
          projectType: 'node',
          language: 'javascript',
          installCommand: 'npm install',
          buildCommand: null,
          startCommand: 'node index.js',
          confidence: 'low',
          envVarsDetected,
        };
      }

      const pkg = JSON.parse(pkgContent);
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      const scripts = pkg.scripts || {};

      // Detect framework by dependency priority
      let projectType = 'node';
      if (deps['next']) projectType = 'nextjs';
      else if (deps['react-scripts']) projectType = 'cra';
      else if (deps['vite']) projectType = 'vite';
      else if (deps['@remix-run/node'] || deps['@remix-run/react']) projectType = 'remix';
      else if (deps['@nestjs/core']) projectType = 'nestjs';
      else if (deps['express']) projectType = 'express';
      else if (deps['fastify']) projectType = 'fastify';
      else if (deps['koa']) projectType = 'koa';

      // Command map per project type
      const commandMap = {
        nextjs:  { install: 'npm install', build: 'npm run build', start: 'npm start' },
        cra:     { install: 'npm install', build: 'npm run build', start: 'npx serve -s build -l $PORT' },
        vite:    { install: 'npm install', build: 'npm run build', start: 'npx serve -s dist -l $PORT' },
        remix:   { install: 'npm install', build: 'npm run build', start: 'npm start' },
        express: { install: 'npm install', build: null, start: 'node index.js' },
        fastify: { install: 'npm install', build: null, start: 'node index.js' },
        koa:     { install: 'npm install', build: null, start: 'node index.js' },
        nestjs:  { install: 'npm install', build: 'npm run build', start: 'node dist/main.js' },
        node:    { install: 'npm install', build: null, start: 'node index.js' },
      };

      const cmds = { ...(commandMap[projectType] || commandMap['node']) };

      // Smart override: if they have a start script, prefer npm start
      if (scripts.start && !['cra', 'vite'].includes(projectType)) {
        cmds.start = 'npm start';
      }

      // If they have a build script and we don't have one mapped, use it
      if (scripts.build && !cmds.build) {
        cmds.build = 'npm run build';
      }

      // Detect main entry point for generic node projects
      if (['express', 'fastify', 'koa', 'node'].includes(projectType) && !scripts.start) {
        if (pkg.main) {
          cmds.start = `node ${pkg.main}`;
        } else if (files.includes('server.js')) {
          cmds.start = 'node server.js';
        } else if (files.includes('app.js')) {
          cmds.start = 'node app.js';
        } else if (files.includes('src/index.js')) {
          cmds.start = 'node src/index.js';
        }
      }

      return {
        projectType,
        language: 'javascript',
        installCommand: cmds.install,
        buildCommand: cmds.build,
        startCommand: cmds.start,
        confidence: projectType === 'node' ? 'medium' : 'high',
        envVarsDetected,
      };
    } catch (err) {
      return {
        projectType: 'node',
        language: 'javascript',
        installCommand: 'npm install',
        buildCommand: null,
        startCommand: 'node index.js',
        confidence: 'low',
        envVarsDetected,
      };
    }
  }

  // ── Python ────────────────────────────────────────────────
  if (files.includes('requirements.txt')) {
    // [L5] Safe read
    const reqsContent = safeReadFileSync(path.join(repoPath, 'requirements.txt'), 'utf8');
    const reqs = (reqsContent || '').toLowerCase();

    if (reqs.includes('django')) {
      return {
        projectType: 'django',
        language: 'python',
        installCommand: 'pip install -r requirements.txt',
        buildCommand: 'python manage.py migrate',
        startCommand: 'python manage.py runserver 0.0.0.0:$PORT',
        confidence: 'high',
        envVarsDetected,
      };
    }

    if (reqs.includes('fastapi') || reqs.includes('uvicorn')) {
      let mainModule = 'main:app';
      if (files.includes('app.py')) mainModule = 'app:app';
      else if (files.includes('server.py')) mainModule = 'server:app';

      return {
        projectType: 'fastapi',
        language: 'python',
        installCommand: 'pip install -r requirements.txt',
        buildCommand: null,
        startCommand: `uvicorn ${mainModule} --host 0.0.0.0 --port $PORT`,
        confidence: 'high',
        envVarsDetected,
      };
    }

    if (reqs.includes('flask')) {
      return {
        projectType: 'flask',
        language: 'python',
        installCommand: 'pip install -r requirements.txt',
        buildCommand: null,
        startCommand: 'flask run --host=0.0.0.0 --port=$PORT',
        confidence: 'high',
        envVarsDetected,
      };
    }

    // Generic Python
    return {
      projectType: 'python',
      language: 'python',
      installCommand: 'pip install -r requirements.txt',
      buildCommand: null,
      startCommand: 'python main.py',
      confidence: 'low',
      envVarsDetected,
    };
  }

  // ── Go ────────────────────────────────────────────────────
  if (files.includes('go.mod')) {
    return {
      projectType: 'go',
      language: 'go',
      installCommand: 'go mod download',
      buildCommand: 'go build -o main .',
      startCommand: './main',
      confidence: 'high',
      envVarsDetected,
    };
  }

  // ── Rust ──────────────────────────────────────────────────
  if (files.includes('Cargo.toml')) {
    return {
      projectType: 'rust',
      language: 'rust',
      installCommand: null,
      buildCommand: 'cargo build --release',
      startCommand: './target/release/app',
      confidence: 'high',
      envVarsDetected,
    };
  }

  // ── PHP (Composer) ────────────────────────────────────────
  if (files.includes('composer.json')) {
    return {
      projectType: 'php',
      language: 'php',
      installCommand: 'composer install',
      buildCommand: null,
      startCommand: 'php -S 0.0.0.0:$PORT -t public',
      confidence: 'medium',
      envVarsDetected,
    };
  }

  // ── Ruby / Rails ──────────────────────────────────────────
  if (files.includes('Gemfile')) {
    const isRails = files.includes('config.ru') || files.includes('Rakefile');
    return {
      projectType: isRails ? 'rails' : 'ruby',
      language: 'ruby',
      installCommand: 'bundle install',
      buildCommand: isRails ? 'rails db:migrate' : null,
      startCommand: isRails ? 'rails server -b 0.0.0.0 -p $PORT' : 'ruby main.rb',
      confidence: isRails ? 'high' : 'medium',
      envVarsDetected,
    };
  }

  // ── Unknown ───────────────────────────────────────────────
  return {
    projectType: 'unknown',
    language: 'unknown',
    installCommand: null,
    buildCommand: null,
    startCommand: null,
    confidence: 'low',
    envVarsDetected,
  };
}

module.exports = { detectProject };
