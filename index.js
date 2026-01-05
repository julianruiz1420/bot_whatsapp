require('dotenv').config();
const express = require('express');
const qrcodeLib = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// 1. CONFIGURACIÓN DE VARIABLES
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const SUPABASE_BUCKET_NAME = 'qr-sessions'; 

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('\n❌ ERROR: Faltan variables de Supabase.');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 2. SERVIDOR EXPRESS (Health Check y Control de Sesión)
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.status(200).send('<h1>Bot CRM Activo</h1><p>Escuchando entradas, salidas y comandos de clasificación.</p>');
});

// Ruta para cerrar sesión y cambiar de cuenta
app.get('/logout', async (req, res) => {
    try {
        console.log('🔄 Solicitud de cierre de sesión recibida...');
        await client.logout();
        res.send('<h1>Sesión Cerrada</h1><p>El bot se está reiniciando para generar un nuevo QR.</p>');
        process.exit(0); 
    } catch (error) {
        console.error('❌ Error al cerrar sesión:', error.message);
        res.status(500).send('Error: ' + error.message);
    }
});

app.listen(port, '0.0.0.0', () => console.log(`[SERVER] Puerto ${port} listo. Acceso a /logout disponible.`));

// 3. INICIALIZACIÓN CON LOCALAUTH (Usa Volumen de Railway)
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

// 4. MANEJO DEL QR (Almacenamiento en Supabase)
client.on('qr', async (qr) => {
    try {
        const qrBuffer = await qrcodeLib.toBuffer(qr, { type: 'png' });
        const fileName = `temp-qr/session-${Date.now()}.png`;
        await supabase.storage.from(SUPABASE_BUCKET_NAME).upload(fileName, qrBuffer, {
            contentType: 'image/png', upsert: true
        });
        const { data } = supabase.storage.from(SUPABASE_BUCKET_NAME).getPublicUrl(fileName);
        console.log('\n----------------------------------------------------');
        console.log(`➡️ ESCANEA AQUÍ PARA VINCULAR: ${data.publicUrl}`);
        console.log('----------------------------------------------------\n');
    } catch (e) {
        console.error('❌ Error QR:', e.message);
    }
});

client.on('ready', () => console.log('✅ BOT CONECTADO. Sesión protegida en el Volumen.'));

// 5. LÓGICA DE MENSAJES Y CLASIFICACIÓN
client.on('message_create', async (msg) => {
    // Ignorar grupos y difusiones
    if (msg.from.includes('@g.us') || msg.from.includes('broadcast')) return;

    const esSalida = msg.fromMe; 
    const direccion = esSalida ? 'salida' : 'entrada';
    const chatId = esSalida ? msg.to : msg.from;
    const telefonoCliente = chatId.replace('@c.us', '');
    const mensajeTexto = msg.body ? msg.body.trim() : `[Tipo: ${msg.type}]`;

    try {
        // --- A. GESTIÓN DE COMANDOS DE CLASIFICACIÓN (Solo Salidas Manuales) ---
        const comandosValidos = ['!cliente recurrente', '!proveedor', '!cliente nuevo'];
        
        if (esSalida && comandosValidos.includes(mensajeTexto.toLowerCase())) {
            const { error: errorUpsert } = await supabase
                .from('contactos')
                .upsert({ 
                    telefono: telefonoCliente, 
                    clasificacion: mensajeTexto.toLowerCase(),
                    nombre: msg._data.notifyName || 'Contacto Identificado'
                }, { onConflict: 'telefono' });

            if (!errorUpsert) {
                console.log(`⭐ Clasificación actualizada: ${telefonoCliente} -> ${mensajeTexto}`);
                await client.sendMessage(msg.to, `*Sistema CRM:* Contacto clasificado como ${mensajeTexto.toUpperCase()}`);
            }
            return; // No guardamos el comando en el historial de mensajes
        }

        // --- B. AUTO-REGISTRO DE CONTACTOS NUEVOS ---
        let { data: contacto } = await supabase
            .from('contactos')
            .select('clasificacion')
            .eq('telefono', telefonoCliente)
            .single();

        if (!contacto) {
            await supabase.from('contactos').insert([{ 
                telefono: telefonoCliente, 
                nombre: msg._data.notifyName || 'Nuevo Registro', 
                clasificacion: '!cliente nuevo' 
            }]);
            console.log(`🆕 Auto-registro: ${telefonoCliente} como !cliente nuevo`);
        }

        // --- C. GUARDADO EN HISTORIAL DE MENSAJES ---
        const { error: errorMsg } = await supabase.from('mensajes_whatsapp').insert([{ 
            telefono_origen: telefonoCliente, 
            mensaje_texto: mensajeTexto, 
            direccion: direccion 
        }]);
        
        if (errorMsg) console.error(`❌ Error Supabase:`, errorMsg.message);

    } catch (error) {
        console.error("❌ Error en procesamiento:", error.message);
    }
});

console.log('🚀 Inicializando cliente...');
client.initialize();