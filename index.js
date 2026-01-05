require('dotenv').config();
const express = require('express');
const qrcodeLib = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// 1. CONFIGURACIÓN
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const app = express();
const port = process.env.PORT || 3000;

// RUTAS DE CONTROL
app.get('/', (req, res) => res.send('Bot CRM Activo - Prioridad Agenda Personal'));
app.get('/logout', async (req, res) => {
    try {
        await client.logout();
        process.exit(0); 
    } catch (e) { res.status(500).send(e.message); }
});
app.listen(port, '0.0.0.0', () => console.log(`[SERVER] Puerto ${port} listo.`));

// 2. INICIALIZACIÓN (Versión remota estable con LocalAuth)
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

// 3. QR Y ALMACENAMIENTO
client.on('qr', async (qr) => {
    try {
        const qrBuffer = await qrcodeLib.toBuffer(qr, { type: 'png' });
        const fileName = `temp-qr/session-${Date.now()}.png`;
        await supabase.storage.from('qr-sessions').upload(fileName, qrBuffer, { contentType: 'image/png', upsert: true });
        const { data } = supabase.storage.from('qr-sessions').getPublicUrl(fileName);
        console.log(`➡️ ESCANEA EL QR AQUÍ: ${data.publicUrl}`);
    } catch (e) {
        console.error('❌ Error QR:', e.message);
    }
});

client.on('ready', () => console.log('✅ BOT CONECTADO.'));

// 4. LÓGICA DE MENSAJES Y CLASIFICACIÓN
client.on('message_create', async (msg) => {
    if (msg.from.includes('@g.us') || msg.from.includes('broadcast')) return;

    const esSalida = msg.fromMe; 
    const chatId = esSalida ? msg.to : msg.from;
    const telefonoCliente = chatId.replace('@c.us', '');
    const mensajeTexto = msg.body ? msg.body.trim() : '';

    try {
        // --- ESTRATEGIA DE NOMBRES POR PRIORIDAD ---
        let nombreFinal = 'Contacto Nuevo';

        try {
            // Paso 1: Intentar obtener el nombre del Chat (Suele ser el de tu agenda personal)
            const chat = await msg.getChat();
            if (chat.name && chat.name !== telefonoCliente) {
                nombreFinal = chat.name;
            } else {
                // Paso 2: Si no hay nombre en la agenda, intentar el nombre de perfil público
                const contacto = await msg.getContact();
                nombreFinal = contacto.name || contacto.pushname || msg._data.notifyName || 'Sin Nombre';
            }
        } catch (e) {
            // Fallback en caso de error de evaluación de WhatsApp
            console.log(`⚠️ Nota: Usando respaldo de perfil para ${telefonoCliente}`);
            nombreFinal = msg._data.notifyName || 'Sin Nombre';
        }

        // A. COMANDOS DE CLASIFICACIÓN (Solo para mensajes que tú envías)
        const comandosValidos = ['!cliente recurrente', '!proveedor', '!cliente nuevo'];
        if (esSalida && comandosValidos.includes(mensajeTexto.toLowerCase())) {
            await supabase.from('contactos').upsert({ 
                telefono: telefonoCliente, 
                clasificacion: mensajeTexto.toLowerCase(),
                nombre: nombreFinal 
            }, { onConflict: 'telefono' });
            
            await client.sendMessage(msg.to, `✅ Clasificado como ${mensajeTexto.toUpperCase()} para: ${nombreFinal}`);
            return;
        }

        // B. AUTO-REGISTRO AUTOMÁTICO (Si no existe en la base de datos)
        let { data: existe } = await supabase.from('contactos').select('telefono').eq('telefono', telefonoCliente).single();

        if (!existe) {
            await supabase.from('contactos').insert([{ 
                telefono: telefonoCliente, 
                nombre: nombreFinal, 
                clasificacion: '!cliente nuevo' 
            }]);
            console.log(`🆕 Auto-registro: ${nombreFinal} (${telefonoCliente})`);
        }

        // C. HISTORIAL DE MENSAJES
        await supabase.from('mensajes_whatsapp').insert([{ 
            telefono_origen: telefonoCliente, 
            mensaje_texto: msg.body, 
            direccion: esSalida ? 'salida' : 'entrada' 
        }]);

    } catch (error) {
        console.error("❌ Error General:", error.message);
    }
});

client.initialize();