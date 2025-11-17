import os
import json
import psycopg2 
# ... tus otras importaciones ...

app = Flask(__name__)

# Función para guardar datos en Supabase (PostgreSQL)
def guardar_mensaje_en_db(telefono, mensaje, tipo='text'):
    # Leer la URI de la base de datos de la variable de entorno de Heroku
    DATABASE_URL = os.environ.get('DATABASE_URL')

    if not DATABASE_URL:
        print("Error: DATABASE_URL no está configurada.")
        return

    try:
        # Conexión a PostgreSQL (Supabase)
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()

        # Comando SQL para insertar el mensaje
        insert_query = """
        INSERT INTO mensajes_whatsapp (telefono_origen, mensaje_texto, tipo_mensaje)
        VALUES (%s, %s, %s);
        """
        cur.execute(insert_query, (telefono, mensaje, tipo))

        # Confirma la transacción
        conn.commit()
        print(f"Mensaje de {telefono} guardado con éxito.")

    except Exception as e:
        print(f"Error al guardar en la base de datos: {e}")
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()

# ... (Tu código del Webhook continúa) ...

@app.route("/webhook", methods=["POST"])
def webhook_post():
    data = request.get_json()
    # ... (Tu código de procesamiento de la notificación) ...

    # Suponiendo que 'data' es el JSON de Meta/WhatsApp
    try:
        # Busca el contenido del mensaje (asumiendo que es un mensaje simple)
        if 'messages' in data['entry'][0]['changes'][0]['value']:
            
            message_data = data['entry'][0]['changes'][0]['value']['messages'][0]
            
            # 1. Obtiene el número de teléfono del usuario
            telefono_origen = message_data['from']
            
            # 2. Verifica el tipo de mensaje y extrae el texto (si existe)
            if message_data['type'] == 'text':
                texto_mensaje = message_data['text']['body']
                tipo_mensaje = 'text'
            else:
                # Si no es texto, guarda solo el tipo (p.ej., 'image', 'sticker')
                texto_mensaje = f"[Mensaje de tipo {message_data['type']}]"
                tipo_mensaje = message_data['type']
            
            # 3. Llama a la función para guardar en la base de datos
            guardar_mensaje_en_db(telefono_origen, texto_mensaje, tipo_mensaje)
            
            # Opcional: Envía una respuesta simple de vuelta al usuario
            # send_whatsapp_message(telefono_origen, "Gracias por tu mensaje, lo hemos guardado.")

    except Exception as e:
        print(f"Error al procesar el JSON: {e}")

    return "OK", 200

# ... (El resto de tu código) ...

if __name__ == "__main__":
    app.run(debug=True)