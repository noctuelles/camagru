FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
COPY --chown=node:node . /home/user/node
USER node
WORKDIR /home/user/node

FROM base AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

FROM base AS dev-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM dev-deps AS build
RUN pnpm run -r build

FROM dev-deps AS back-dev
WORKDIR /home/user/node/packages/back
CMD ["pnpm", "dev"]

FROM dev-deps AS front-dev
WORKDIR /home/user/node/packages/front
CMD ["pnpm", "dev"]



