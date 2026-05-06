FROM public.ecr.aws/d3j8x8q7/olympus-base-typescript:latest

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --no-frozen-lockfile

COPY . .

CMD ["bash"]
