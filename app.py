from flask import Flask, render_template, request, Response, stream_with_context, jsonify, send_from_directory
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import json
import logging
import random
import time
import re
import markdown
import html
import fitz  # PyMuPDF
import os
from werkzeug.utils import secure_filename
import math
import pytesseract
from PIL import Image

app = Flask(__name__, static_folder='static')
logging.basicConfig(level=logging.INFO)

# Configuración para subida de archivos
UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
STATIC_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static', 'uploads')
ALLOWED_EXTENSIONS = {'pdf', 'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'tiff'}

# Crear carpetas necesarias si no existen
try:
    for folder in [UPLOAD_FOLDER, STATIC_FOLDER]:
        if not os.path.exists(folder):
            os.makedirs(folder)
            app.logger.info(f"Carpeta creada en: {folder}")
except Exception as e:
    app.logger.error(f"Error al crear carpetas: {str(e)}")

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['STATIC_FOLDER'] = STATIC_FOLDER
app.config['MAX_CHUNK_SIZE'] = 10000
app.config['REQUEST_TIMEOUT'] = 300
app.config['last_image_text'] = None
app.config['image_history'] = {}  # Diccionario para almacenar el historial de imágenes por chat

# Configurar Tesseract
if os.name == 'nt':  # Windows
    try:
        tesseract_path = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
        if not os.path.exists(tesseract_path):
            raise Exception(f"Tesseract no encontrado en {tesseract_path}")
        
        pytesseract.pytesseract.tesseract_cmd = tesseract_path
        version = pytesseract.get_tesseract_version()
        app.logger.info(f"Tesseract OCR configurado correctamente. Versión: {version}")
    except Exception as e:
        app.logger.error(f"Error al configurar Tesseract: {str(e)}")
        app.logger.error("Por favor, asegúrese de que Tesseract OCR está instalado correctamente")
        print("\nERROR: Tesseract OCR no está configurado correctamente")
        print("1. Verifique que Tesseract OCR está instalado en C:\\Program Files\\Tesseract-OCR")
        print("2. Si está instalado en otra ubicación, actualice la ruta en el código")
        print("3. Asegúrese de haber instalado los paquetes de idioma necesarios")
        print(f"Error detallado: {str(e)}\n")

# Configuración de Ollama
OLLAMA_API_URL = os.getenv('OLLAMA_HOST', 'http://localhost:11434') + '/api/generate'

# Verificar conexión con Ollama
try:
    response = requests.get(os.getenv('OLLAMA_HOST', 'http://localhost:11434') + '/api/tags')
    if response.status_code == 200:
        app.logger.info("Conexión con Ollama establecida correctamente")
    else:
        app.logger.error(f"Error al conectar con Ollama. Código de estado: {response.status_code}")
except Exception as e:
    app.logger.error(f"No se pudo conectar con Ollama: {str(e)}")

# Configurar reintentos y timeout
retry_strategy = Retry(
    total=3,
    backoff_factor=1,
    status_forcelist=[429, 500, 502, 503, 504],
)
adapter = HTTPAdapter(max_retries=retry_strategy)
http = requests.Session()
http.mount("http://", adapter)
http.mount("https://", adapter)
http.request = lambda *args, **kwargs: requests.Session.request(http, *args, **{**kwargs, 'timeout': app.config['REQUEST_TIMEOUT']})

# Emojis simplificados
THINKING_EMOJI = '🤔'
RESPONSE_EMOJI = '🤖'
ERROR_EMOJI = '⚠️'

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def extract_text_from_pdf(file_path):
    try:
        doc = fitz.open(file_path)
        text = ""
        total_pages = doc.page_count
        logging.info(f"Procesando PDF con {total_pages} páginas")
        
        for page_num, page in enumerate(doc, 1):
            page_text = page.get_text()
            text += page_text
            logging.debug(f"Página {page_num}/{total_pages} procesada")
        
        doc.close()
        logging.info(f"PDF procesado completamente. Texto extraído: {len(text)} caracteres")
        return text
    except Exception as e:
        logging.error(f"Error extracting text from PDF: {str(e)}")
        return None

def chunk_text(text, chunk_size):
    """Divide el texto en fragmentos de tamaño aproximado."""
    words = text.split()
    total_words = len(words)
    chunks = []
    current_chunk = []
    current_size = 0
    
    logging.info(f"Procesando texto de {total_words} palabras para fragmentación")
    
    for word in words:
        word_size = len(word.split())  # Aproximación simple de tokens
        if current_size + word_size > chunk_size and current_chunk:
            chunk_text = ' '.join(current_chunk)
            chunks.append(chunk_text)
            logging.debug(f"Fragmento creado con {len(current_chunk)} palabras")
            current_chunk = [word]
            current_size = word_size
        else:
            current_chunk.append(word)
            current_size += word_size
    
    # Asegurarse de incluir el último fragmento
    if current_chunk:
        chunk_text = ' '.join(current_chunk)
        chunks.append(chunk_text)
        logging.debug(f"Último fragmento creado con {len(current_chunk)} palabras")
    
    total_words_in_chunks = sum(len(chunk.split()) for chunk in chunks)
    logging.info(f"Total de palabras procesadas: {total_words_in_chunks} de {total_words}")
    
    if total_words_in_chunks < total_words:
        logging.warning(f"Se perdieron {total_words - total_words_in_chunks} palabras durante el procesamiento")
    
    return chunks

@app.route('/')
def home():
    try:
        # Verificar que Ollama esté funcionando
        try:
            response = requests.get(os.getenv('OLLAMA_HOST', 'http://localhost:11434') + '/api/tags', timeout=5)
            if response.status_code != 200:
                app.logger.error("Ollama no está respondiendo correctamente")
                return render_template('error.html', error="Ollama no está respondiendo. Por favor, asegúrate de que Ollama esté corriendo.")
        except requests.exceptions.RequestException as e:
            app.logger.error(f"No se puede conectar con Ollama: {str(e)}")
            return render_template('error.html', error="No se puede conectar con Ollama. Por favor, asegúrate de que Ollama esté corriendo.")
        
        return render_template('index.html')
    except Exception as e:
        app.logger.error(f"Error en la ruta principal: {str(e)}")
        return render_template('error.html', error="Error interno del servidor")

@app.route('/upload', methods=['POST'])
def upload_file():
    try:
        if 'file' not in request.files:
            app.logger.error("No se encontró archivo en la solicitud")
            return jsonify({'success': False, 'error': 'No se encontró el archivo'}), 400
        
        file = request.files['file']
        if file.filename == '':
            app.logger.error("Nombre de archivo vacío")
            return jsonify({'success': False, 'error': 'No se seleccionó ningún archivo'}), 400
        
        if not allowed_file(file.filename):
            app.logger.error(f"Tipo de archivo no permitido: {file.filename}")
            return jsonify({'success': False, 'error': 'Tipo de archivo no permitido'}), 400
        
        try:
            filename = secure_filename(file.filename)
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(file_path)
            app.logger.info(f"Archivo guardado exitosamente: {file_path}")
            
            if filename.lower().endswith('.pdf'):
                # Procesar PDF
                text = extract_text_from_pdf(file_path)
                if not text:
                    raise Exception("No se pudo extraer texto del PDF")
                
                chunks = chunk_text(text, app.config['MAX_CHUNK_SIZE'])
                if not chunks:
                    raise Exception("No se pudo dividir el texto en fragmentos")
                
                if 'pdf_chunks' not in app.config:
                    app.config['pdf_chunks'] = {}
                app.config['pdf_chunks'][filename] = chunks
                
                os.remove(file_path)  # Limpiar archivo temporal
                app.logger.info(f"PDF procesado exitosamente: {len(chunks)} fragmentos")
                
                return jsonify({
                    'success': True,
                    'message': f'PDF procesado exitosamente',
                    'filename': filename,
                    'num_chunks': len(chunks)
                })
            
            return jsonify({'success': True, 'filename': filename})
            
        except Exception as e:
            app.logger.error(f"Error procesando archivo: {str(e)}")
            if os.path.exists(file_path):
                os.remove(file_path)  # Limpiar en caso de error
            return jsonify({'success': False, 'error': str(e)}), 500
        
    except Exception as e:
        app.logger.error(f"Error en upload_file: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500

def clean_math_expressions(text):
    """Limpia y formatea expresiones matemáticas."""
    # No eliminar los backslashes necesarios para LaTeX
    replacements = {
        r'\\begin\{align\*?\}': '',
        r'\\end\{align\*?\}': '',
        r'\\begin\{equation\*?\}': '',
        r'\\end\{equation\*?\}': '',
        r'\\ ': ' '  # Reemplazar \\ espacio con un espacio normal
    }
    
    for pattern, replacement in replacements.items():
        text = re.sub(pattern, replacement, text)
    
    return text

def format_math(text):
    """Formatea expresiones matemáticas para KaTeX."""
    def process_math_content(match):
        content = match.group(1).strip()
        content = clean_math_expressions(content)
        return f'$${content}$$'

    # Procesar comandos especiales de LaTeX antes de los bloques matemáticos
    text = re.sub(r'\\boxed\{\\text\{([^}]*)\}\}', r'<div class="boxed">\1</div>', text)
    text = re.sub(r'\\boxed\{([^}]*)\}', r'<div class="boxed">\1</div>', text)
    
    # Procesar bloques matemáticos inline y display
    text = re.sub(r'\$\$(.*?)\$\$', lambda m: f'$${m.group(1)}$$', text, flags=re.DOTALL)
    text = re.sub(r'\$(.*?)\$', lambda m: f'${m.group(1)}$', text)
    text = re.sub(r'\\\[(.*?)\\\]', process_math_content, text, flags=re.DOTALL)
    text = re.sub(r'\\\((.*?)\\\)', lambda m: f'${m.group(1)}$', text)
    
    # Preservar comandos LaTeX específicos
    text = re.sub(r'\\times(?![a-zA-Z])', r'\\times', text)  # Preservar \times
    text = re.sub(r'\\frac\{([^}]*)\}\{([^}]*)\}', r'\\frac{\1}{\2}', text)  # Preservar fracciones
    text = re.sub(r'\\text\{([^}]*)\}', r'\1', text)  # Manejar \text correctamente
    
    return text

def format_code_blocks(text):
    """Formatea bloques de código con resaltado de sintaxis."""
    def replace_code_block(match):
        language = match.group(1) or 'plaintext'
        code = match.group(2).strip()
        return f'```{language}\n{code}\n```'

    # Procesar bloques de código
    text = re.sub(r'```(\w*)\n(.*?)```', replace_code_block, text, flags=re.DOTALL)
    return text

def format_response(text):
    """Formatea la respuesta completa con soporte para markdown, código y matemáticas."""
    # Primero formatear expresiones matemáticas
    text = format_math(text)
    
    # Formatear bloques de código
    text = format_code_blocks(text)
    
    # Convertir markdown a HTML preservando las expresiones matemáticas
    # Escapar temporalmente las expresiones matemáticas
    math_blocks = []
    def math_replace(match):
        math_blocks.append(match.group(0))
        return f'MATH_BLOCK_{len(math_blocks)-1}'

    # Guardar expresiones matemáticas
    text = re.sub(r'\$\$.*?\$\$|\$.*?\$', math_replace, text, flags=re.DOTALL)
    
    # Convertir markdown a HTML
    md = markdown.Markdown(extensions=['fenced_code', 'tables'])
    text = md.convert(text)
    
    # Restaurar expresiones matemáticas
    for i, block in enumerate(math_blocks):
        text = text.replace(f'MATH_BLOCK_{i}', block)
    
    # Limpiar y formatear el texto
    text = text.replace('</think>', '').replace('<think>', '')
    text = re.sub(r'\n\s*\n', '\n\n', text)
    text = re.sub(r'([.!?])\s*([A-Z])', r'\1\n\2', text)
    
    return text.strip()

def decorate_message(message, is_error=False):
    """Decora el mensaje con emojis y formato apropiado."""
    emoji = ERROR_EMOJI if is_error else RESPONSE_EMOJI
    if is_error:
        return f"{emoji} {message}"
    
    formatted_message = format_response(message)
    return f"{emoji} {formatted_message}"

def get_thinking_message():
    """Genera un mensaje de 'pensando' aleatorio."""
    messages = [
        "Analizando tu pregunta...",
        "Procesando la información...",
        "Elaborando una respuesta...",
        "Pensando...",
        "Trabajando en ello...",
    ]
    return f"{THINKING_EMOJI} {random.choice(messages)}"

@app.route('/chat', methods=['POST'])
def chat():
    data = request.json
    user_message = data.get('message', '')
    model = data.get('model', 'deepseek-r1:7b')
    filename = data.get('pdf_file', None)
    chunk_index = data.get('chunk_index', 0)
    chat_id = data.get('chat_id', None)
    history = data.get('history', [])  # Obtener el historial de mensajes
    
    app.logger.debug(f"Mensaje recibido: {user_message}")
    app.logger.debug(f"Modelo seleccionado: {model}")

    def generate():
        try:
            # Enviar mensaje inicial de "pensando"
            thinking_msg = get_thinking_message()
            yield json.dumps({
                'thinking': thinking_msg
            }) + '\n'
            
            # Construir el historial de conversación de manera más estructurada
            conversation_history = ""
            if history:
                # Limitar el historial a las últimas 10 interacciones para no sobrecargar el contexto
                recent_history = history[-10:]
                for msg in recent_history:
                    # Limpiar el contenido del mensaje de HTML y otros formatos
                    content = re.sub(r'<[^>]+>', '', msg.get('content', ''))
                    role = "Usuario" if msg.get('isUser', False) else "Asistente"
                    conversation_history += f"{role}: {content}\n\n"
            
            # Construir el prompt base con instrucciones más específicas
            system_prompt = """Eres un asistente AI conversacional. Para mantener la coherencia en la conversación:
1. Usa el contexto del historial de la conversación para entender el tema actual
2. Haz referencia a información mencionada previamente cuando sea relevante
3. Mantén la continuidad temática
4. Si el usuario hace referencia a algo mencionado anteriormente, usa esa información en tu respuesta

Historial de la conversación:
{history}

Nueva pregunta del usuario: {question}

Responde de manera coherente, considerando todo el contexto de la conversación anterior."""

            # Preparar el prompt base con el historial
            prompt = system_prompt.format(
                history=conversation_history,
                question=user_message
            )
            
            # Si hay historial de imágenes para este chat
            if chat_id and chat_id in app.config['image_history']:
                image_texts = app.config['image_history'][chat_id]
                
                # Detectar si el usuario se refiere específicamente a "esta imagen" o "esta otra imagen"
                if any(phrase in user_message.lower() for phrase in ["esta imagen", "esta otra imagen", "la imagen"]):
                    # Usar solo la última imagen
                    if image_texts:
                        last_image_text = image_texts[-1]
                        context = f"La imagen contiene este texto:\n\n{last_image_text}"
                        prompt = system_prompt.format(
                            history=f"{conversation_history}\n\nContexto de la imagen: {context}",
                            question=user_message
                        )
                else:
                    # Si no hay referencia específica, usar todas las imágenes
                    image_contexts = []
                    for idx, img_text in enumerate(image_texts, 1):
                        image_contexts.append(f"Imagen {idx}:\n{img_text}")
                    
                    if image_contexts:
                        context = "\n\n".join(image_contexts)
                        prompt = system_prompt.format(
                            history=f"{conversation_history}\n\nContexto de las imágenes:\n{context}",
                            question=user_message
                        )
            
            # Solo incluir contexto del PDF si hay un archivo activo Y está en el mismo chat
            elif filename and filename in app.config.get('pdf_chunks', {}) and data.get('isPdfChat', False):
                chunks = app.config['pdf_chunks'][filename]
                
                # Construir el contexto combinando fragmentos relevantes
                context_chunks = []
                
                # Siempre incluir el fragmento actual
                current_chunk = chunks[chunk_index]
                context_chunks.append(f"Fragmento {chunk_index + 1}:\n{current_chunk}")
                
                # Incluir fragmentos adyacentes si están disponibles
                if chunk_index > 0:
                    prev_chunk = chunks[chunk_index - 1]
                    context_chunks.insert(0, f"Fragmento {chunk_index}:\n{prev_chunk}")
                
                if chunk_index < len(chunks) - 1:
                    next_chunk = chunks[chunk_index + 1]
                    context_chunks.append(f"Fragmento {chunk_index + 2}:\n{next_chunk}")
                
                # Combinar los fragmentos en un solo contexto
                combined_context = "\n\n".join(context_chunks)
                
                prompt = system_prompt.format(
                    history=f"{conversation_history}\n\nContexto del PDF (fragmentos {chunk_index + 1} y adyacentes de {len(chunks)} totales):\n\n{combined_context}",
                    question=user_message
                )
            
            payload = {
                'model': model,
                'prompt': prompt,
                'stream': True,
                'context_window': 4096  # Asegurar que tenemos suficiente contexto
            }
            
            app.logger.debug(f"Enviando solicitud a Ollama API con payload: {payload}")
            
            try:
                response = http.post(
                    OLLAMA_API_URL,
                    json=payload,
                    stream=True,
                    timeout=60  # Aumentar timeout a 60 segundos
                )
            except requests.exceptions.Timeout:
                error_msg = "La solicitud está tomando más tiempo de lo esperado. Por favor, intenta con un mensaje más corto o espera un momento."
                app.logger.error(error_msg)
                yield json.dumps({
                    'error': decorate_message(error_msg, is_error=True)
                }) + '\n'
                return
            except requests.exceptions.ConnectionError:
                error_msg = "No se pudo conectar con Ollama. Por favor, verifica que Ollama esté corriendo."
                app.logger.error(error_msg)
                yield json.dumps({
                    'error': decorate_message(error_msg, is_error=True)
                }) + '\n'
                return
            
            app.logger.debug(f"Estado de respuesta de Ollama API: {response.status_code}")
            if response.status_code != 200:
                error_msg = f"Error al conectar con Ollama API. Código de estado: {response.status_code}. Respuesta: {response.text}"
                app.logger.error(error_msg)
                yield json.dumps({
                    'error': decorate_message(error_msg, is_error=True)
                }) + '\n'
                return

            # Limpiar mensaje de "pensando" y comenzar a mostrar la respuesta
            yield json.dumps({'clear_thinking': True}) + '\n'
            
            # Inicializar acumulador de respuesta
            full_response = ""
            
            for line in response.iter_lines():
                if line:
                    # Verificar si la conexión fue cerrada por el cliente
                    if request.environ.get('werkzeug.socket') and hasattr(request.environ['werkzeug.socket'], 'closed') and request.environ['werkzeug.socket'].closed:
                        app.logger.info("El cliente canceló la solicitud")
                        return
                        
                    try:
                        json_response = json.loads(line)
                        app.logger.debug(f"Fragmento de respuesta recibido: {json_response}")
                        ai_response = json_response.get('response', '')
                        if ai_response:
                            full_response += ai_response
                            # Formatear y enviar la respuesta completa hasta el momento
                            decorated_response = decorate_message(full_response)
                            yield json.dumps({'response': decorated_response}) + '\n'
                        
                    except json.JSONDecodeError as e:
                        app.logger.error(f"Error al decodificar JSON: {str(e)} para la línea: {line}")
                        continue

        except Exception as e:
            error_msg = f"Error de conexión: {str(e)}"
            app.logger.error(error_msg)
            yield json.dumps({
                'error': decorate_message(error_msg, is_error=True)
            }) + '\n'

    return Response(stream_with_context(generate()), mimetype='text/event-stream')

@app.route('/health', methods=['GET'])
def health_check():
    """Endpoint de verificación de salud"""
    status = {
        'status': 'healthy',
        'message': "Servidor en funcionamiento",
        'timestamp': time.time()
    }
    return json.dumps(status)

@app.route('/upload_image', methods=['POST'])
def upload_image():
    try:
        if 'file' not in request.files:
            app.logger.error("No se encontró imagen en la solicitud")
            return jsonify({'success': False, 'error': 'No se encontró el archivo'})
        
        chat_id = request.form.get('chat_id')  # Obtener el ID del chat desde el formulario
        if not chat_id:
            app.logger.error("No se proporcionó ID de chat")
            return jsonify({'success': False, 'error': 'No se proporcionó ID de chat'})
        
        file = request.files['file']
        if file.filename == '':
            app.logger.error("Nombre de archivo de imagen vacío")
            return jsonify({'success': False, 'error': 'No se seleccionó ningún archivo'})
        
        if not allowed_file(file.filename):
            app.logger.error(f"Tipo de imagen no permitido: {file.filename}")
            return jsonify({'success': False, 'error': 'Tipo de archivo no permitido'})
        
        try:
            filename = secure_filename(file.filename)
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            static_filepath = os.path.join(app.config['STATIC_FOLDER'], filename)
            
            # Guardar el archivo original
            file.save(filepath)
            app.logger.info(f"Imagen guardada exitosamente: {filepath}")
            
            try:
                # Procesar la imagen para OCR
                image = Image.open(filepath)
                if image.mode in ('RGBA', 'P'):
                    image = image.convert('RGB')
                
                # Guardar una copia en la carpeta estática
                image.save(static_filepath)
                
                text = pytesseract.image_to_string(image, lang='spa+eng')
                text = text.strip()
                
                if not text:
                    app.logger.warning(f"No se pudo extraer texto de la imagen: {filename}")
                    text = "No se pudo extraer texto de esta imagen. Asegúrate de que la imagen contenga texto claro y legible."
                
                os.remove(filepath)  # Limpiar archivo temporal original
                app.logger.info(f"Imagen procesada exitosamente: {len(text)} caracteres extraídos")
                
                # Inicializar el historial de imágenes para este chat si no existe
                if chat_id not in app.config['image_history']:
                    app.config['image_history'][chat_id] = []
                
                # Agregar el texto de la imagen al historial
                app.config['image_history'][chat_id].append(text)
                
                # También mantener la última imagen para compatibilidad
                app.config['last_image_text'] = text
                
                return jsonify({
                    'success': True,
                    'message': '¡Imagen procesada exitosamente! Ahora puedes hacer preguntas sobre su contenido.',
                    'filename': filename,
                    'image_url': f'/static/uploads/{filename}'
                })
                
            except Exception as e:
                app.logger.error(f"Error procesando imagen: {str(e)}")
                if os.path.exists(filepath):
                    os.remove(filepath)
                if os.path.exists(static_filepath):
                    os.remove(static_filepath)
                return jsonify({
                    'success': False,
                    'error': f'Error al procesar la imagen: {str(e)}'
                })
            
        except Exception as e:
            app.logger.error(f"Error guardando imagen: {str(e)}")
            return jsonify({
                'success': False,
                'error': f'Error al guardar la imagen: {str(e)}'
            })
            
    except Exception as e:
        app.logger.error(f"Error en upload_image: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Error en el servidor: {str(e)}'
        })

# Ruta para servir archivos estáticos de uploads
@app.route('/static/uploads/<filename>')
def serve_upload(filename):
    return send_from_directory(app.config['STATIC_FOLDER'], filename)

if __name__ == '__main__':
    try:
        # Configurar el logger para mostrar más información
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s'
        )

        # Verificar que el puerto 5000 esté disponible
        import socket
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(1)
        result = sock.connect_ex(('127.0.0.1', 5000))
        sock.close()
        
        if result == 0:
            print("ERROR: El puerto 5000 está en uso.")
            print("Intente estos pasos:")
            print("1. Ejecute 'netstat -ano | findstr :5000' para encontrar el proceso")
            print("2. Cierre la aplicación que está usando el puerto 5000")
            print("3. O inicie la aplicación en un puerto diferente modificando el código")
            exit(1)

        # Verificar permisos de la carpeta de uploads
        uploads_path = os.path.abspath(UPLOAD_FOLDER)
        if not os.path.exists(uploads_path):
            try:
                os.makedirs(uploads_path)
                print(f"✓ Carpeta de uploads creada en: {uploads_path}")
            except Exception as e:
                print(f"ERROR: No se pudo crear la carpeta de uploads: {str(e)}")
                exit(1)

        # Verificar conexión con Ollama
        try:
            response = requests.get(os.getenv('OLLAMA_HOST', 'http://localhost:11434') + '/api/tags', timeout=5)
            if response.status_code == 200:
                print("✓ Conexión con Ollama establecida")
            else:
                print("ERROR: Ollama no está respondiendo correctamente")
                print("Por favor, asegúrese de que Ollama esté en ejecución")
                exit(1)
        except requests.exceptions.RequestException as e:
            print("ERROR: No se puede conectar con Ollama")
            print("1. Asegúrese de que Ollama esté instalado")
            print("2. Ejecute Ollama antes de iniciar esta aplicación")
            print(f"Error detallado: {str(e)}")
            exit(1)

        print("\n=== Iniciando Servidor de Chat IA ===")
        print("✓ Todas las verificaciones completadas")
        print("✓ Servidor iniciando en: http://127.0.0.1:5000")
        print("* Presione Ctrl+C para detener el servidor")
        print("=====================================\n")

        # Iniciar el servidor con host='0.0.0.0' para permitir conexiones externas
        app.run(host='0.0.0.0', port=5000, debug=True, use_reloader=False)
    except Exception as e:
        print(f"\nERROR CRÍTICO: No se pudo iniciar el servidor")
        print(f"Causa: {str(e)}")
        print("\nPor favor, verifique:")
        print("1. Que no haya otra aplicación usando el puerto 5000")
        print("2. Que tenga permisos de administrador si es necesario")
        print("3. Que todas las dependencias estén instaladas correctamente")
        exit(1) 