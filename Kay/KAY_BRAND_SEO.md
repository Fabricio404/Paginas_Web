# KAY - Brand Guidelines & SEO Strategy

## Rol del Asistente (Experto en SEO)
**Instrucción de comportamiento:** Actuar en todo momento como un **Experto en SEO**. Todas las decisiones de desarrollo web, creación de contenido, estructura HTML, metaetiquetas y arquitectura del sitio deben seguir las mejores prácticas de optimización para motores de búsqueda (Search Engine Optimization), con el objetivo de maximizar la visibilidad orgánica de KAY.

---

## Paleta de Colores de la Marca (Estilo Retro/Boho)

Esta imagen presenta una paleta de colores cálida, suave y elegante con aires retro/boho. Aquí tienes la descripción detallada de cada tono y su aplicación en la imagen:

- **Fondo general:** Un blanco roto o beige muy claro con un matiz suave y cálido (crema pastel).
- **Fondo circular:** Un beige rosado o marfil suave un poco más oscuro que el fondo general, lo que genera un contraste muy sutil y delimita el círculo central.
- **Color principal del texto ("KAY" y el eslogan):** Un vino tinto o borgoña profundo (un tono burdeos/marrón rojizo) con un matiz cálido que aporta elegancia y peso visual a la marca.
- **Ornamentos ornamentales superiores:**
  - **Pétalos centrales:** Un rosa magenta / fucsia apagado o malva vibrante que añade un toque festivo y femenino.
  - **Hojas laterales:** Un azul turquesa apagado o verde azulado nórdico (teal), que crea un contraste fresco y armonioso con los tonos cálidos.
  - **Puntos superiores e inferiores del eslogan:** Un mostaza o dorado apagado (un ocre cálido), que sirve como acento alegre y brillante.
- **Corazón inferior:** El mismo tono rosa magenta / malva que los pétalos centrales superiores, cerrando la composición visual en la parte inferior.

### Códigos HEX Oficiales
- **Vino Profundo:** `#72213B`
- **Magenta:** `#B64888`
- **Azul Petróleo:** `#2E728B`
- **Verde Azulado:** `#689AA3`
- **Terracota:** `#B76B2C`
- **Mostaza:** `#D89135`

## Responsive Design (Mobile-First)
- **Experiencia de Usuario en Móviles:** La web debe ser completamente adaptable a dispositivos móviles (teléfonos, tablets).
- **Navegación:** El menú principal (Inicio, Catálogo, Nosotros, Contactos) NUNCA debe estar oculto en móvil. Se debe ajustar usando flexbox (apilado o en dos filas) para que el usuario siempre pueda navegar libremente.
- **Legibilidad:** Asegurar tamaños de fuente amigables para pantallas pequeñas.

---

## Confirmación del pedido (Doble Confirmación Supabase-WhatsApp)

**El Problema Actual:** 
Cuando un cliente hace clic en "Enviar Pedido", el stock se resta automáticamente de Supabase y se abre WhatsApp. Si el cliente decide no enviar el mensaje de WhatsApp o no realiza el pago, el stock se pierde (queda descontado en la base de datos sin una venta real).

**Solución Estratégica (Manejo de Estados de Pedido):**
Para evitar que el stock se descuente erróneamente sin confirmación real, no debes descontar el stock definitivo de inmediato. Debes implementar un sistema de **"Reserva Temporal" o "Doble Confirmación"**.

Existen dos enfoques recomendados para solucionar esto:

### Opción 1: Descuento Manual por el Administrador (Recomendado para WhatsApp)
1. **Validación:** Cuando el cliente presiona "Pedir", Supabase *solo verifica* si hay stock suficiente, pero **NO** lo resta.
2. **Generación de Orden:** Se crea un registro en una tabla de Supabase llamada `pedidos` con estado `Pendiente`.
3. **WhatsApp:** El cliente envía el mensaje.
4. **Confirmación Real:** Una vez que tú (el jefe) confirmas el pago por WhatsApp, entras a un panel de administración (o ejecutas una función) que cambia el estado del pedido a `Confirmado` y es en ese momento donde **realmente se resta el stock** de la base de datos.

### Opción 2: Reserva Temporal con Caducidad (Stock Reservado)
1. **Reserva:** Cuando el cliente pide, la función en Supabase (RPC) no resta el `stock_disponible`, sino que suma esa cantidad a una columna llamada `stock_reservado`.
2. **Stock Real:** El stock que ve la página web sería `stock_disponible - stock_reservado`.
3. **Caducidad:** Si en 30 o 60 minutos el administrador no marca el pedido como "Pagado" en Supabase, un proceso automático (Cron Job de Supabase) cancela la orden y devuelve el `stock_reservado` a 0, liberando los postres nuevamente para otros clientes.
### Opción 3: Automatización Total (Sin intervención manual)
Si no quieres estar pendiente de cada venta ni confirmar manualmente los pedidos, la única forma de que el sistema sepa si la venta fue real (y reste el stock de forma segura) es conectar WhatsApp con Supabase mediante un **Bot y Webhooks**.

1. **El cliente pide:** Se descuenta el stock como "Reservado" en Supabase.
2. **WhatsApp Bot:** El mensaje llega a tu número y un Bot (usando la API oficial de WhatsApp, ManyChat, o herramientas similares) responde automáticamente pidiendo el pago o enviando un link de pago (MercadoPago, Stripe, etc.).
3. **Confirmación Automática (Webhook):** Cuando la pasarela de pago confirma que el cliente pagó, envía una señal invisible (Webhook) directamente a Supabase.
4. **Actualización en BD:** Supabase recibe esa señal, marca el pedido como "Pagado", y convierte el stock reservado en una venta final. Si el cliente no paga en 30 minutos, el sistema cancela la reserva automáticamente y el postre vuelve a estar disponible en la web.

**Decisión a tomar:** 
- Si buscas la ruta más rápida y barata ahora mismo: Sigue con la **Opción 1 o 2** (requiere un poco de revisión humana).
- Si quieres que el negocio corra en piloto automático: Implementa la **Opción 3**, aunque requiere configurar herramientas externas (Bot de WhatsApp y pasarela de pagos) para que hablen con tu base de datos. 

## Integración con stripe: 

### Instalación y Configuración del SDK de Stripe para Python

#### 1. Configurar un Entorno Virtual (Recomendado)
Recomendamos administrar las dependencias mediante el módulo `venv` para mantener tu proyecto aislado.

**En Windows:**
```bash
python3 -m venv env 
.\env\Scripts\activate.bat
```
**En GNU/Linux o MacOS:**
```bash
python3 -m venv env 
source env/bin/activate
```

#### 2. Instalar el SDK de Stripe
El SDK del lado del servidor de Stripe para Python es compatible con Python 3.6+. Instala la biblioteca utilizando `pip`:

```bash
pip3 install --upgrade stripe
```
Si utilizas un archivo `requirements.txt`, especifica la versión así: `stripe>=15.6.0`

#### 3. Ejecuta tu primera solicitud (Ejemplo Práctico)
Crea un archivo llamado `create_price.py` para probar la conexión creando un producto de prueba.

> **Importante:** Nunca incrustes claves secretas en código de producción. Utiliza variables de entorno.

```python
import stripe 

# Configura tu clave secreta de prueba
client = stripe.StripeClient("sk_test_tu_clave_secreta") 

# Crear un producto en Stripe
starter_subscription = client.v1.products.create(params={ 
    "name": "Starter Subscription", 
    "description": "$12/Month subscription", 
}) 

# Adjuntar un precio al producto (ej: $12.00 USD)
starter_subscription_price = client.v1.prices.create(params={ 
    "unit_amount": 1200, 
    "currency": "usd", 
    "recurring": {"interval": "month"}, 
    "product": starter_subscription['id'], 
}) 

print(f"Éxito! Product ID: {starter_subscription.id}") 
print(f"Éxito! Price ID: {starter_subscription_price.id}")
```

Ejecuta el script desde la terminal:
```bash
python3 create_price.py
```
Si todo es correcto, la consola te devolverá los identificadores de tu nuevo producto creado en Stripe.

---

## 🔐 Arquitectura de Seguridad Avanzada

### Principio Fundamental: Ninguna contraseña o clave secreta en el código fuente

Todo secreto real debe vivir en el servidor (Supabase), nunca en archivos `.js`, `.html` o `.json` del repositorio. El repositorio puede ser público sin comprometer la seguridad.

---

### Capa 1 — Clasificación de Claves

| Clave | Tipo | ¿Se puede exponer en el JS del cliente? | Ubicación |
|---|---|---|---|
| `SUPABASE_URL` | Pública | ✅ Sí | `script.js`, `admin.js` |
| `SUPABASE_ANON_KEY` | Pública (publishable) | ✅ Sí | `script.js`, `admin.js` |
| `SUPABASE_SERVICE_ROLE_KEY` | **SECRETA** | ❌ NUNCA | Solo en servidores / Edge Functions |
| Contraseña del admin | **SECRETA** | ❌ NUNCA | Solo en Supabase Auth (hasheada con bcrypt) |
| Claves de Stripe | **SECRETA** | ❌ NUNCA | Solo en backend / Edge Functions |

> **¿Por qué el ANON KEY es seguro en el cliente?**
> Supabase diseñó el ANON KEY para ser público. Su poder está limitado exactamente por las políticas RLS que tú definas. Sin RLS correctamente configurado, el ANON KEY sería peligroso; **con RLS, es inofensivo**.

---

### Capa 2 — Row Level Security (RLS) en Supabase

RLS es el mecanismo que controla qué operaciones puede hacer cada tipo de usuario sobre cada tabla, a nivel de base de datos (no de aplicación).

```
┌─────────────────────────────────────────────────────────────────┐
│                     TABLA: pedidos                               │
│                                                                  │
│  Usuario anónimo (cliente de la web):                           │
│    INSERT ✅ (solo puede crear nuevos pedidos via RPC)          │
│    SELECT ❌ (no puede ver pedidos de otros)                    │
│    UPDATE ❌ (no puede modificar nada)                          │
│    DELETE ❌ (no puede borrar nada)                             │
│                                                                  │
│  Usuario autenticado (admin con login):                         │
│    INSERT ✅  SELECT ✅  UPDATE ✅  DELETE ✅                   │
└─────────────────────────────────────────────────────────────────┘
```

**Regla de oro:** Si RLS está activado y no existe una política que lo permita, la operación está bloqueada por defecto.

---

### Capa 3 — Funciones RPC con SECURITY DEFINER

Las funciones en Supabase que operan sobre el stock usan `SECURITY DEFINER`, lo que significa que se ejecutan con los permisos del creador de la función (superuser), no del usuario que las llama. Esto permite:

- Que un usuario anónimo pueda "crear un pedido" sin tener permiso de INSERT directo en la tabla.
- Que la función verifique internamente `auth.uid()` antes de restar stock.
- Que **ningún cliente pueda bypass-ar la lógica de validación** modificando la llamada desde el navegador.

```
Cliente → llama rpc('create_pending_order') → Supabase verifica stock → inserta pedido
                                           ↕ (la función rechaza si no hay stock)

Admin   → llama rpc('confirm_order')      → Supabase verifica auth.uid() → resta stock
                                           ↕ (la función rechaza si no está autenticado)
```

---

### Capa 4 — Supabase Auth (sin contraseñas en el código)

El sistema de login del panel admin (`admin.html`) usa `supabase.auth.signInWithPassword()`. Lo que ocurre internamente:

1. El navegador envía email + contraseña a los servidores de Supabase via HTTPS.
2. Supabase compara la contraseña con el hash bcrypt almacenado en su base de datos interna.
3. Si coincide, devuelve un **JWT token** firmado con expiración.
4. Ese token se guarda en `localStorage` del navegador y se envía automáticamente en cada petición posterior.
5. En el servidor, Supabase verifica la firma del JWT para autenticar al usuario.

**Resultado:** La contraseña del admin nunca aparece en ningún archivo del proyecto. Ni en texto plano, ni cifrada, ni en variables de entorno del frontend.

---

### Capa 5 — Auditoría y Trazabilidad

Cada acción del admin (confirmar, cancelar, editar) queda registrada en la tabla `audit_log` con:
- `order_code`: El pedido afectado.
- `accion`: El tipo de acción realizada.
- `usuario`: El email del admin que la ejecutó (obtenido de `auth.email()` en el servidor).
- `detalle`: JSON con el estado antes y después (útil para disputas).
- `created_at`: Marca de tiempo exacta.

Esto garantiza que, ante cualquier discrepancia de stock, siempre hay un historial completo de quién hizo qué y cuándo.

---

### Capa 6 — Protección XSS en el Panel Admin

El archivo `admin.js` aplica sanitización a todos los datos que vienen de la base de datos antes de renderizarlos en el HTML, usando la función `escapeHTML()`. Esto previene ataques de Cross-Site Scripting en caso de que un cliente malintencionado introduzca código HTML/JS en su nombre o teléfono al hacer un pedido.

---

### Checklist de Seguridad

- [ ] RLS activado en tablas `pedidos` y `audit_log`
- [ ] Políticas RLS creadas para anon e autenticado
- [ ] Funciones RPC con `SECURITY DEFINER` y verificación de `auth.uid()`
- [ ] Contraseña del admin creada en Supabase Auth (Dashboard → Authentication → Users)
- [ ] `SERVICE_ROLE_KEY` nunca mencionado en ningún archivo del repositorio
- [ ] `admin.html` con meta `noindex, nofollow` para que no sea indexado por Google
- [ ] Sesiones JWT expiran automáticamente (configurable en Supabase Auth Settings)

