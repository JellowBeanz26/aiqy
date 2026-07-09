# AIQY container image (EXPERIMENTAL).
# The verified path is `npm run dev` on the host. This image runs the app and spawns
# per-agent `eve dev` processes inside the container; generated agents/settings should
# be mounted as a volume (they are DATA, never baked into the image).
#
# Notes / limits:
#  - Single-user trust boundary: generated tool code runs with the container's user.
#  - Inside a plain container Eve's sandbox falls back to a non-isolating shell; for
#    untrusted multi-user use, add microsandbox/Docker-in-Docker (Phase 2).
FROM node:24-slim

WORKDIR /app

# App deps
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

# App source + production build
COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 4300

# .data holds the shared Eve runtime + generated agents — mount it as a volume.
VOLUME ["/app/.data"]

CMD ["npm", "run", "start"]
