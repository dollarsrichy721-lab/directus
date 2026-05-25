FROM public.ecr.aws/d3j8x8q7/olympus-base-typescript:latest
WORKDIR /app
RUN npm install -g n@9.2.0 && n 22.15.0
ENV PATH="/usr/local/bin:$PATH"
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY . .
RUN node --version && \
    pnpm config set fetch-retries 5 && \
    pnpm config set fetch-retry-mintimeout 20000 && \
    pnpm config set fetch-retry-maxtimeout 120000 && \
    pnpm install --frozen-lockfile
RUN pnpm -r build
CMD ["bash"]
