# Usa una imagen base de Node.js
FROM node:20-slim

# Crea el directorio de trabajo
WORKDIR /app

# Copia los archivos de definición de dependencias
COPY package*.json ./

# Instala las dependencias de sistema CRÍTICAS para Puppeteer
# Esto incluye las librerías necesarias para libgobject-2.0.so.0
RUN apt-get update && apt-get install -y \
    build-essential \
    libgtk-3-0 \
    libgconf-2-4 \
    libnss3 \
    libasound2 \
    libxtst6 \
    libxss1 \
    libatk-bridge2.0-0 \
    libgbm-dev \
    # Incluye el paquete que contiene libgobject-2.0.so.0
    libglib2.0-0 \
    fonts-liberation \
    wget \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Instala las dependencias de Node
RUN npm install

# Copia el resto del código
COPY . .

# Comando de inicio
CMD [ "node", "index.js" ]