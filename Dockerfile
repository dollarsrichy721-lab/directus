FROM public.ecr.aws/d3j8x8q7/olympus-base-typescript:latest
WORKDIR /app
RUN npm install -g n && n 22 && node --version
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY . .
RUN node --version && pnpm install --frozen-lockfile
CMD ["bash"]
