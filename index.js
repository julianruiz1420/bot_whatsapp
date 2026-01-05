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
app.get('/', (req, res) => res.send('Bot CRM Activo y Corregido'));
app.get('/logout', async (req, res) => {
    try {
        await client.logout();
        process.exit(0); 
    } catch (e) { res.status(500).send(e.message); }
});
app.listen(port, '0.0.0.0', () => console.log(`[SERVER] Puerto ${port} listo.`));

// 2. INICIALIZACIÓN (Versión remota estable)
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

// 3. QR Y LISTO
client.on('qr', async (qr) => {
    const qrBuffer = await qrcodeLib.toBuffer(qr, { type: 'png' });
    const fileName = `temp-qr/session-${Date.now()}.png`;
    await supabase.storage.from('qr-sessions').upload(fileName, qrBuffer, { contentType: 'image/png', upsert: true });
    const { data } = supabase.storage.from('qr-sessions').getPublicUrl(fileName);
    console.log(`➡️ QR: ${data.publicUrl}`);
});

client.on('ready', () => console.log('✅ BOT CONECTADO.'));

// 4. LÓGICA DE MENSAJES CON SOLUCIÓN AL ERROR DE NOMBRES
client.on('message_create', async (msg) => {
    if (msg.from.includes('@g.us') || msg.from.includes('broadcast')) return;

    const esSalida = msg.fromMe; 
    const chatId = esSalida ? msg.to : msg.from;
    const telefonoCliente = chatId.replace('@c.us', '');
    const mensajeTexto = msg.body ? msg.body.trim() : '';

    try {
        // --- SOLUCIÓN AL ERROR: Intento de obtener contacto con respaldo ---
        let nombreFinal = msg._data.notifyName || 'Contacto Nuevo';
        
        try {
            // Intentamos obtener el contacto, si falla por el error de WhatsApp, usamos el nombre de perfil
            const contacto = await msg.getContact();
            if (contacto.name || contacto.pushname) {
                nombreFinal = contacto.name || contacto.pushname;
            }
        } catch (e) {
            console.log(`⚠️ Error getContact (esperado): Usando nombre de perfil para ${telefonoCliente}`);
        }

        // A. COMANDOS DE CLASIFICACIÓN
        const comandosValidos = ['!cliente recurrente', '!proveedor', '!cliente nuevo'];
        if (esSalida && comandosValidos.includes(mensajeTexto.toLowerCase())) {
            await supabase.from('contactos').upsert({ 
                telefono: telefonoCliente, 
                clasificacion: mensajeTexto.toLowerCase(),
                nombre: nombreFinal 
            }, { onConflict: 'telefono' });
            
            await client.sendMessage(msg.to, `✅ Clasificado como ${mensajeTexto.toUpperCase()}`);
            return;
        }

        // B. AUTO-REGISTRO AUTOMÁTICO (Si no está, es !cliente nuevo)
        let { data: existe } = await supabase.from('contactos').select('telefono').eq('telefono', telefonoCliente).single();

        if (!existe) {
            await supabase.from('contactos').insert([{ 
                telefono: telefonoCliente, 
                nombre: nombreFinal, 
                clasificacion: '!cliente nuevo' 
            }]);
            console.log(`🆕 Auto-registro: ${nombreFinal}`);
        }

        // C. HISTORIAL
        await supabase.from('mensajes_whatsapp').insert([{ 
            telefono_origen: telefonoCliente, 
            mensaje_texto: mensajeTexto, 
            direccion: esSalida ? 'salida' : 'entrada' 
        }]);

    } catch (error) {
        console.error("❌ Error General:", error.message);
    }
});

client.initialize();