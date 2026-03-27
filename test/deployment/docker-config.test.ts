import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(process.cwd());

describe("Dockerfile", () => {
  const content = fs.readFileSync(path.join(ROOT, "Dockerfile"), "utf-8");

  it("exists and is non-empty", () => {
    expect(content.length).toBeGreaterThan(0);
  });

  it("uses multi-stage build", () => {
    const stages = content.match(/^FROM\s+/gm);
    expect(stages).not.toBeNull();
    expect(stages!.length).toBeGreaterThanOrEqual(4); // base, deps, builder, runner
  });

  it("installs Playwright system dependencies", () => {
    expect(content).toContain("libnss3");
    expect(content).toContain("libgbm1");
  });

  it("installs nansen-cli globally", () => {
    expect(content).toContain("npm install -g nansen-cli");
  });

  it("installs Playwright Chromium", () => {
    expect(content).toContain("playwright-core install");
    expect(content).toContain("chromium");
  });

  it("sets PLAYWRIGHT_BROWSERS_PATH for shared access", () => {
    expect(content).toContain("PLAYWRIGHT_BROWSERS_PATH");
  });

  it("uses standalone Next.js output", () => {
    expect(content).toContain(".next/standalone");
    expect(content).toContain(".next/static");
  });

  it("creates data and images directories", () => {
    expect(content).toContain("mkdir -p public/images data");
  });

  it("runs as non-root user", () => {
    expect(content).toContain("USER nextjs");
  });

  it("exposes port 3000", () => {
    expect(content).toContain("EXPOSE 3000");
  });

  it("starts with node server.js", () => {
    expect(content).toContain('CMD ["node", "server.js"]');
  });
});

describe("docker-compose.yml", () => {
  const content = fs.readFileSync(
    path.join(ROOT, "docker-compose.yml"),
    "utf-8"
  );

  it("exists and is non-empty", () => {
    expect(content.length).toBeGreaterThan(0);
  });

  it("defines app service", () => {
    expect(content).toContain("app:");
  });

  it("defines nginx service", () => {
    expect(content).toContain("nginx:");
  });

  it("defines certbot service", () => {
    expect(content).toContain("certbot:");
  });

  it("persists SQLite data via volume", () => {
    expect(content).toContain("./data:/app/data");
  });

  it("persists card images via volume", () => {
    expect(content).toContain("./public/images");
  });

  it("mounts nginx.conf as read-only", () => {
    expect(content).toContain("nginx.conf:/etc/nginx/conf.d/default.conf:ro");
  });

  it("mounts certbot volumes", () => {
    expect(content).toContain("certbot/conf:/etc/letsencrypt");
    expect(content).toContain("certbot/www:/var/www/certbot");
  });

  it("includes healthcheck for app", () => {
    expect(content).toContain("healthcheck:");
    expect(content).toContain("curl");
  });

  it("nginx depends on app service", () => {
    expect(content).toContain("depends_on:");
  });

  it("loads env from .env file", () => {
    expect(content).toContain("env_file:");
    expect(content).toContain(".env");
  });
});

describe("nginx.conf", () => {
  const content = fs.readFileSync(path.join(ROOT, "nginx.conf"), "utf-8");

  it("exists and is non-empty", () => {
    expect(content.length).toBeGreaterThan(0);
  });

  it("listens on port 80", () => {
    expect(content).toContain("listen 80");
  });

  it("includes Let's Encrypt ACME challenge location", () => {
    expect(content).toContain("/.well-known/acme-challenge/");
    expect(content).toContain("/var/www/certbot");
  });

  it("proxies to app:3000", () => {
    expect(content).toContain("proxy_pass http://app:3000");
  });

  it("sets X-Real-IP header for rate limiting", () => {
    expect(content).toContain("X-Real-IP");
    expect(content).toContain("$remote_addr");
  });

  it("sets X-Forwarded-For header", () => {
    expect(content).toContain("X-Forwarded-For");
  });

  it("disables proxy buffering for SSE", () => {
    expect(content).toContain("proxy_buffering off");
  });

  it("serves card images directly from disk", () => {
    expect(content).toContain("location /images/");
    expect(content).toContain("/usr/share/nginx/images/");
  });

  it("caches OG images with 24h TTL", () => {
    expect(content).toContain("location /api/og/");
    expect(content).toContain("max-age=86400");
  });

  it("has commented HTTPS server block for post-SSL setup", () => {
    expect(content).toContain("listen 443 ssl");
    expect(content).toContain("thesnitch.xyz");
  });

  it("includes gzip compression in HTTPS block", () => {
    expect(content).toContain("gzip on");
    expect(content).toContain("gzip_types");
  });
});

describe(".dockerignore", () => {
  const content = fs.readFileSync(path.join(ROOT, ".dockerignore"), "utf-8");

  it("exists and is non-empty", () => {
    expect(content.length).toBeGreaterThan(0);
  });

  it("excludes node_modules", () => {
    expect(content).toContain("node_modules");
  });

  it("excludes .next build output", () => {
    expect(content).toContain(".next");
  });

  it("excludes .env files", () => {
    expect(content).toContain(".env");
  });

  it("excludes test files", () => {
    expect(content).toContain("test/");
  });

  it("excludes SQLite databases", () => {
    expect(content).toContain("data/*.db");
  });

  it("excludes generated images", () => {
    expect(content).toContain("public/images/*.png");
  });
});
