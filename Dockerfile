FROM public.ecr.aws/d3j8x8q7/olympus-base-typescript:latest
WORKDIR /app
RUN node --version && pnpm --version
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
CMD ["bash"]
