FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node package.json ./
RUN npm install --omit=dev --ignore-scripts
COPY --chown=node:node server.js game.js room-store.js ./
COPY --chown=node:node public ./public
USER node
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
