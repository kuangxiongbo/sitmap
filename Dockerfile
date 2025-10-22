# 使用Node.js官方镜像作为基础镜像
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 复制package.json和package-lock.json（如果存在）
COPY package*.json ./

# 安装依赖
RUN npm install

# 复制所有源代码
COPY . .

# 创建数据目录
RUN mkdir -p /app/data

# 暴露端口80
EXPOSE 80

# 设置环境变量，让服务器监听所有接口
ENV PORT=80

# 启动应用
CMD ["node", "server/server.js"]

