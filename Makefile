# ─────────────────────────────────────────────────────────────────────────────
# Congregation Event Management — project shortcuts
# ─────────────────────────────────────────────────────────────────────────────

.PHONY: dev dev-db dev-api dev-portal dev-admin dev-gate \
        build prod prod-down migrate seed \
        android-build android-open

# ── Development ───────────────────────────────────────────────────────────────

## Start the local PostgreSQL container
dev-db:
	docker compose up -d postgres

## Run the backend in watch mode (requires dev-db)
dev-api:
	cd backend && npm run dev

## Run the graduate portal dev server
dev-portal:
	cd frontend && pnpm dev:portal

## Run the admin console dev server
dev-admin:
	cd frontend && pnpm dev:admin

## Run the gate scanner dev server
dev-gate:
	cd frontend && pnpm dev:gate

## Start postgres + open three terminals for api, portal, admin
dev: dev-db
	@echo "Postgres running. Open separate terminals and run:"
	@echo "  make dev-api    (backend on :3000)"
	@echo "  make dev-portal (portal on :5173)"
	@echo "  make dev-admin  (admin  on :5174)"
	@echo "  make dev-gate   (gate   on :5175)"

# ── Database ──────────────────────────────────────────────────────────────────

## Apply schema to the running database (dev)
migrate:
	cd backend && npm run db:migrate

## Seed initial super-admin user (dev)
seed:
	cd backend && npm run db:seed

# ── Production ────────────────────────────────────────────────────────────────

## Build all frontend apps
build:
	cd frontend && pnpm install && pnpm build

## Start the full production stack (requires .env.prod and pre-built frontend)
prod: build
	docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

## Stop the production stack
prod-down:
	docker compose -f docker-compose.prod.yml down

## View production logs
prod-logs:
	docker compose -f docker-compose.prod.yml logs -f

# ── Android APK (Gate app) ────────────────────────────────────────────────────

## Build the gate web app and sync to Android
android-build:
	cd frontend && pnpm --filter @congregation/gate build
	cd frontend/apps/gate && npx cap sync android

## Open the gate app in Android Studio
android-open:
	cd frontend/apps/gate && npx cap open android

## First-time Android platform setup (run once)
android-init:
	cd frontend/apps/gate && npx cap add android && npx cap sync android
