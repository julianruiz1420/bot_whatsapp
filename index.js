require('dotenv').config();
const express = require('express');
const qrcodeLib = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// 1. CONFIGURACIÓN DE SERVICIOS
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const app = express();
const port = process.env.PORT || 3000;

// Health Check para Railway
app.get('/', (req, res) => res.send('Bot CRM - Optimización y Clasificación Activa'));
app.listen(port, '0.0.0.0', () => console.log(`[SERVER] Puerto ${port} listo.`));

// 2. INICIALIZACIÓN DEL CLIENTE
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: 'session',
        dataPath: path.join(__dirname, '.wwebjs_auth') 
    }),
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
    },
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--no-zygote']
    }
});

// 3. GESTIÓN DE QR
client.on('qr', async (qr) => {
    try {
        const qrBuffer = await qrcodeLib.toBuffer(qr, { type: 'png' });
        const fileName = `temp-qr/session-${Date.now()}.png`;
        await supabase.storage.from('qr-sessions').upload(fileName, qrBuffer, { contentType: 'image/png', upsert: true });
        const { data } = supabase.storage.from('qr-sessions').getPublicUrl(fileName);
        console.log(`➡️ QR LINK: ${data.publicUrl}`);
    } catch (e) {
        console.error('❌ Error QR:', e.message);
    }
});

client.on('ready', () => console.log('✅ BOT CONECTADO.'));

// --- 4. CONFIGURACIÓN DE OPTIMIZACIÓN (FILTRO DE CHATS) ---
// Solo se guardará el historial de mensajes para estas categorías:
const CLASIFICACIONES_PERMITIDAS = ['!cliente nuevo', '!cliente recurrente'];

client.on('message_create', async (msg) => {
    // Ignorar grupos y difusiones para no saturar la base de datos
    if (msg.from.includes('@g.us') || msg.from.includes('broadcast')) return;

    const esSalida = msg.fromMe; 
    const chatId = esSalida ? msg.to : msg.from;
    const telefono = chatId.replace('@c.us', '');
    const mensajeTexto = msg.body ? msg.body.trim() : '';

    try {
        // --- A. OBTENER NOMBRE (PRIORIDAD AGENDA -> PERFIL) ---
        let nombreDetectado = msg._data.notifyName || 'Contacto Nuevo';
        try {
            const chat = await msg.getChat();
            if (chat.name && chat.name !== telefono) {
                nombreDetectado = chat.name;
            }
        } catch (e) {
            // Si getChat falla por el error de evaluación, mantenemos el nombre de perfil
        }

        // --- B. VERIFICAR CLASIFICACIÓN EXISTENTE ---
        let { data: contacto } = await supabase
            .from('contactos')
            .select('nombre, clasificacion')
            .eq('telefono', telefono)
            .single();

        let clasificacionActual = contacto ? contacto.clasificacion : '!cliente nuevo';

        // --- C. COMANDOS DE CLASIFICACIÓN (TODOS DISPONIBLES) ---
        const comandos = ['!cliente recurrente', '!proveedor', '!cliente nuevo', '!grupo de gestion', '!operador'];
        
        if (esSalida && comandos.includes(mensajeTexto.toLowerCase())) {
            const nuevaClasificacion = mensajeTexto.toLowerCase();
            await supabase.from('contactos').upsert({ 
                telefono, 
                clasificacion: nuevaClasificacion, 
                nombre: nombreDetectado 
            }, { onConflict: 'telefono' });
            
            console.log(`⭐ Clasificación actualizada: ${nombreDetectado} -> ${nuevaClasificacion}`);
            return; // No guardamos el comando en el historial
        }

        // --- D. AUTO-REGISTRO DE NUEVOS CONTACTOS ---
        if (!contacto) {
            await supabase.from('contactos').insert([{ 
                telefono, 
                nombre: nombreDetectado, 
                clasificacion: '!cliente nuevo' 
            }]);
            console.log(`🆕 Auto-registro: ${nombreDetectado}`);
        }

        // --- E. CONTROL DE ALMACENAMIENTO (RESTRICCIÓN CRM) ---
        // Solo guardamos si es cliente. Proveedores, Operadores y Grupos de Gestión no ocupan espacio.
        if (CLASIFICACIONES_PERMITIDAS.includes(clasificacionActual)) {
            await supabase.from('mensajes_whatsapp').insert([{ 
                telefono_origen: telefono, 
                mensaje_texto: mensajeTexto, 
                direccion: esSalida ? 'salida' : 'entrada' 
            }]);
        } else {
            // Opcional: Log para confirmar que el ahorro de espacio funciona
            // console.log(`🧹 Mensaje omitido para: ${clasificacionActual}`);
        }

    } catch (error) {
        console.error("❌ Error en flujo:", error.message);
    }
});

client.initialize();