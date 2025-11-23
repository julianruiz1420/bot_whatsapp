# Usa una imagen base de Node.js
FROM node:20-slim

# Crea el directorio de trabajo
WORKDIR /app

# Copia los archivos de definición de dependencias
COPY package*.json ./

# Instala las dependencias de sistema CRÍTICAS para Puppeteer
# Estas librerías resuelven el error "libgobject-2.0.so.0"
RUN apt-get update && apt-get install -y \
    gconf-service \
    libappindicator1 \
    libasound2 \
    libatk1.0-0 \
    libbz2-1.0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libgconf-2-4 \
    libgdk-pixbuf2.0-0 \
    libglib2.0-0 \
    libgtk-3-0 \
    liblzma5 \
    libnspr4 \
    libnss3 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    libzstd1 \
    # Librerías específicas para el error que tienes
    libgobject-2.0-0 \
    ca-certificates \
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