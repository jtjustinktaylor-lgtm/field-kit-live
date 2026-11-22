FROM node:24-bookworm-slim
WORKDIR /app
COPY --chown=node:node package.json server.cjs ./
COPY --chown=node:node public ./public
RUN mkdir /app/data && chown node:node /app/data
USER node
ENV PORT=8433 HOST=0.0.0.0 DB_PATH=/app/data/pilots.sqlite
VOLUME ["/app/data"]
EXPOSE 8433
CMD ["node","server.cjs"]
