document.addEventListener('DOMContentLoaded', () => {

    // --- CONFIGURACIÓN DE SUPABASE ---
    // Reemplaza estas credenciales con las de tu proyecto de Supabase
    const SUPABASE_URL = 'https://tzsbxnlygxuzjmxafvez.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_vr1hMYlWgzT2lkpfLzT3cg_zOqTNeQb';

    let supabase = null;
    let productStocks = {}; // Almacena { "Nombre del Producto": stock_disponible }

    if (typeof window.supabase !== 'undefined') {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } else {
        console.warn('El script de Supabase no se cargó correctamente.');
    }

    // --- Notificaciones Toast Personalizadas ---
    function showToast(message, type = 'error') {
        const existingToast = document.querySelector('.custom-toast');
        if (existingToast) {
            existingToast.remove();
        }

        const toast = document.createElement('div');
        toast.className = `custom-toast toast-${type}`;
        
        let icon = '⚠️';
        if (type === 'success') icon = '✅';
        if (type === 'error') icon = '❌';
        
        toast.innerHTML = `
            <div class="custom-toast-icon">${icon}</div>
            <div class="custom-toast-message">${message}</div>
            <button class="custom-toast-close">&times;</button>
        `;

        document.body.appendChild(toast);

        setTimeout(() => toast.classList.add('show'), 50);

        const autoClose = setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 400);
        }, 4000);

        toast.querySelector('.custom-toast-close').addEventListener('click', () => {
            clearTimeout(autoClose);
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 400);
        });
    }

    // --- Variables de Estado del Carrito ---
    let cart = [];
    const cartCountElement = document.getElementById('cartCount');
    const cartBtn = document.getElementById('cartBtn');

    const cartModal = document.getElementById('cartModal');
    const closeCartModal = document.getElementById('closeCartModal');
    const cartItemsContainer = document.getElementById('cartItemsContainer');
    const checkoutBtn = document.getElementById('checkoutBtn');
    const clearCartBtn = document.getElementById('clearCartBtn');

    const orderModal = document.getElementById('orderModal');
    const closeOrderModal = document.getElementById('closeOrderModal');
    const orderForm = document.getElementById('orderForm');
    const submitOrderBtn = document.getElementById('submitOrderBtn');
    const orderStatusMsg = document.getElementById('orderStatusMsg');

    const mockStripeModal = document.getElementById('mockStripeModal');
    const closeStripeModal = document.getElementById('closeStripeModal');
    const stripeMockForm = document.getElementById('stripeMockForm');
    const stripeTotalAmount = document.getElementById('stripeTotalAmount');
    const simulatePaymentBtn = document.getElementById('simulatePaymentBtn');
    const stripeBtnText = document.getElementById('stripeBtnText');
    const stripeSpinner = document.getElementById('stripeSpinner');
    const stripeStatusMsg = document.getElementById('stripeStatusMsg');

    // Inicializar carrito desde localStorage
    try {
        if (localStorage.getItem('bakinGodsCart')) {
            const parsedCart = JSON.parse(localStorage.getItem('bakinGodsCart'));
            if (Array.isArray(parsedCart)) {
                cart = parsedCart;
            }
        }
    } catch (e) {
        cart = [];
    }
    updateCartUI();
    fetchAndRenderStocks(); // Carga el stock en tiempo real

    // --- Funciones para manejar el Stock con Supabase ---
    async function fetchAndRenderStocks() {
        if (!supabase) return;
        try {
            const { data, error } = await supabase
                .from('products')
                .select('name, stock');

            if (error) throw error;

            if (data) {
                data.forEach(p => {
                    productStocks[p.name] = p.stock;
                });
                updateProductGridStocks();
            }
        } catch (err) {
            console.error('Error al cargar stock desde Supabase:', err.message);
        }
    }

    function updateProductGridStocks() {
        document.querySelectorAll('.stock-count').forEach(el => {
            const productName = el.getAttribute('data-product');
            const stock = productStocks[productName] !== undefined ? productStocks[productName] : 0;
            el.textContent = stock;

            const card = el.closest('.product-card');
            const indicator = el.closest('.stock-indicator');
            const btn = card ? card.querySelector('.add-to-cart') : null;
            const qtyInput = card ? card.querySelector('.item-qty') : null;

            if (qtyInput) {
                qtyInput.max = stock;
            }

            if (indicator) {
                indicator.classList.remove('low-stock', 'out-of-stock');
                if (stock === 0) {
                    indicator.classList.add('out-of-stock');
                    el.parentElement.innerHTML = '<strong>Agotado</strong>';
                } else if (stock <= 5) {
                    indicator.classList.add('low-stock');
                }
            }

            if (stock === 0) {
                if (card) card.classList.add('agotado');
                if (btn) {
                    btn.disabled = true;
                    btn.textContent = 'Agotado';
                }
            } else {
                if (card) card.classList.remove('agotado');
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = 'Pedir';
                }
            }
        });
    }

    // --- Lógica del Carrito ---
    const addToCartBtns = document.querySelectorAll('.add-to-cart');

    addToCartBtns.forEach(btn => {
        btn.addEventListener('click', function () {
            const productName = this.getAttribute('data-product');
            const qtyInput = this.parentElement.querySelector('.item-qty');
            const qty = qtyInput ? parseInt(qtyInput.value) || 1 : 1;

            // Validar stock disponible localmente antes de añadir
            const availableStock = productStocks[productName] !== undefined ? productStocks[productName] : 0;
            const existingItem = cart.find(item => item.name === productName);
            const currentQty = existingItem ? existingItem.qty : 0;

            if (currentQty + qty > availableStock) {
                showToast(`Lo sentimos, no hay suficiente stock. Disponible: ${availableStock}. Ya tienes ${currentQty} en tu cesta.`, 'error');
                return;
            }

            if (existingItem) {
                existingItem.qty += qty;
            } else {
                cart.push({ name: productName, qty: qty });
            }
            saveCart();
            updateCartUI();

            // Animación visual del botón
            const originalText = this.textContent;
            this.textContent = '¡Añadido!';
            this.style.backgroundColor = 'var(--color-secondary)'; // Magenta for success
            this.style.color = 'white';

            if (cartBtn) {
                cartBtn.style.transform = 'scale(1.2)';
                setTimeout(() => cartBtn.style.transform = 'scale(1)', 200);
            }

            setTimeout(() => {
                this.textContent = originalText;
                this.style.backgroundColor = ''; // Remove inline style to revert to CSS
                this.style.color = '';
                if (qtyInput) qtyInput.value = 1;
            }, 1500);
        });
    });

    function saveCart() {
        localStorage.setItem('bakinGodsCart', JSON.stringify(cart));
    }

    function updateCartUI() {
        if (!cartCountElement) return;

        const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);
        cartCountElement.textContent = totalItems;

        if (!cartItemsContainer) return;

        cartItemsContainer.innerHTML = '';

        if (cart.length === 0) {
            cartItemsContainer.innerHTML = '<p class="empty-cart-msg">Tu cesta está vacía.</p>';
            if (checkoutBtn) checkoutBtn.disabled = true;
            if (clearCartBtn) clearCartBtn.style.display = 'none';
        } else {
            cart.forEach((item, index) => {
                const itemEl = document.createElement('div');
                itemEl.className = 'cart-item';

                itemEl.innerHTML = `
                    <div class="cart-item-title">${item.name}</div>
                    <div class="qty-controls">
                        <button class="qty-btn minus" data-index="${index}">-</button>
                        <span style="font-weight: bold; width: 25px; text-align: center; display: inline-block;">${item.qty}</span>
                        <button class="qty-btn plus" data-index="${index}">+</button>
                        <button class="remove-item-btn remove-item" data-index="${index}">Quitar</button>
                    </div>
                `;
                cartItemsContainer.appendChild(itemEl);
            });
            if (checkoutBtn) checkoutBtn.disabled = false;
            if (clearCartBtn) clearCartBtn.style.display = 'block';

            // Event Listeners para botones de la cesta
            document.querySelectorAll('.qty-btn.minus').forEach(btn => {
                btn.addEventListener('click', function () {
                    const idx = this.getAttribute('data-index');
                    if (cart[idx].qty > 1) {
                        cart[idx].qty -= 1;
                    } else {
                        cart.splice(idx, 1);
                    }
                    saveCart();
                    updateCartUI();
                });
            });

            document.querySelectorAll('.qty-btn.plus').forEach(btn => {
                btn.addEventListener('click', function () {
                    const idx = this.getAttribute('data-index');
                    const item = cart[idx];
                    const availableStock = productStocks[item.name] !== undefined ? productStocks[item.name] : 80;
                    if (item.qty < availableStock) {
                        item.qty += 1;
                        saveCart();
                        updateCartUI();
                    } else {
                        showToast(`No hay más stock disponible (${availableStock} unidades máximo).`, 'warning');
                    }
                });
            });

            document.querySelectorAll('.remove-item').forEach(btn => {
                btn.addEventListener('click', function () {
                    const idx = this.getAttribute('data-index');
                    cart.splice(idx, 1);
                    saveCart();
                    updateCartUI();
                });
            });
        }
    }

    // --- Abrir/Cerrar Modales ---
    if (cartBtn && cartModal) {
        cartBtn.addEventListener('click', () => cartModal.style.display = 'block');
    }
    if (closeCartModal && cartModal) {
        closeCartModal.addEventListener('click', () => cartModal.style.display = 'none');
    }

    if (clearCartBtn) {
        clearCartBtn.addEventListener('click', () => {
            cart = [];
            saveCart();
            updateCartUI();
        });
    }

    if (checkoutBtn && cartModal) {
        checkoutBtn.addEventListener('click', () => {
            cartModal.style.display = 'none';
            if (mockStripeModal) {
                // Simulación de Reserva de Stock (Supabase Pendiente)
                showToast('Sistema: Creando pedido PENDIENTE en base de datos y reservando stock...', 'success');
                
                setTimeout(() => {
                    mockStripeModal.style.display = 'block';
                    // Calculate mock total (assuming all prices are simple, for demo we just show a static or simple calculated total)
                    let total = cart.reduce((sum, item) => sum + (item.qty * 15), 0); // Assuming 15 PEN/USD per item for demo
                    if (stripeTotalAmount) stripeTotalAmount.textContent = 'S/ ' + total.toFixed(2);
                    if (stripeStatusMsg) {
                        stripeStatusMsg.textContent = '';
                        stripeStatusMsg.className = 'form-msg';
                    }
                }, 1500); // Pequeño delay simulando llamada a la API
            } else if (orderModal) {
                orderModal.style.display = 'block';
                if (orderStatusMsg) orderStatusMsg.textContent = '';
            }
        });
    }

    if (closeOrderModal && orderModal) {
        closeOrderModal.addEventListener('click', () => orderModal.style.display = 'none');
    }

    if (closeStripeModal && mockStripeModal) {
        closeStripeModal.addEventListener('click', () => {
            mockStripeModal.style.display = 'none';
            // Simulación de liberación de stock al cancelar
            showToast('Sistema: Pago cancelado o expirado. Liberando stock reservado en Supabase...', 'error');
        });
    }

    window.addEventListener('click', (e) => {
        if (e.target === cartModal) cartModal.style.display = 'none';
        if (e.target === orderModal) orderModal.style.display = 'none';
        if (e.target === mockStripeModal) {
            mockStripeModal.style.display = 'none';
            // Simulación de liberación de stock al clickear fuera (cancelar)
            showToast('Sistema: Pago cancelado o expirado. Liberando stock reservado en Supabase...', 'error');
        }
    });

    // --- Demo Mock Stripe Payment ---
    if (stripeMockForm) {
        stripeMockForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            simulatePaymentBtn.disabled = true;
            stripeBtnText.style.display = 'none';
            stripeSpinner.style.display = 'block';
            
            stripeStatusMsg.textContent = 'Conectando con el banco...';
            stripeStatusMsg.className = 'form-msg';
            
            setTimeout(() => {
                stripeStatusMsg.textContent = 'Procesando pago...';
                
                setTimeout(() => {
                    simulatePaymentBtn.disabled = false;
                    stripeBtnText.style.display = 'block';
                    stripeSpinner.style.display = 'none';
                    
                    stripeStatusMsg.textContent = '✅ Pago Exitoso. Redirigiendo...';
                    stripeStatusMsg.classList.add('msg-success');
                    
                    setTimeout(() => {
                        mockStripeModal.style.display = 'none';
                        showToast('Sistema: Webhook de Stripe recibido. Pedido marcado como PAGADO. Stock descontado definitivamente.', 'success');
                        
                        cart = [];
                        saveCart();
                        updateCartUI();
                        // Realistically we would fetch stocks again if they were actually reduced on the DB
                    }, 1500);
                }, 1500);
            }, 1000);
        });
    }

    // --- Enviar Pedido vía WhatsApp (Sistema de Orden Pendiente) ---
    // El stock NO se descuenta aquí. Solo se crea un registro PENDIENTE en Supabase.
    // El admin confirma el pago en admin.html y en ese momento sí se resta el stock.
    if (orderForm) {
        orderForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const name = document.getElementById('orderName').value.trim();
            const phone = document.getElementById('orderPhone').value.trim();

            if (!name || !phone || cart.length === 0) return;

            submitOrderBtn.disabled = true;
            submitOrderBtn.textContent = 'Generando pedido...';
            orderStatusMsg.textContent = '';
            orderStatusMsg.className = 'form-msg';

            // Preparar items con la estructura que espera el RPC
            const orderItems = cart.map(item => ({
                name: item.name,
                qty: item.qty
            }));

            let orderCode = null;

            if (supabase) {
                try {
                    // Llama a create_pending_order — NO resta stock, solo crea el pedido
                    const { data: res, error: rpcErr } = await supabase.rpc('create_pending_order', {
                        p_items:    orderItems,
                        p_nombre:   name,
                        p_telefono: phone
                    });

                    if (rpcErr) throw rpcErr;

                    if (res && res.success === false) {
                        showToast(res.message || 'No hay stock suficiente para completar el pedido.', 'error');
                        submitOrderBtn.disabled = false;
                        submitOrderBtn.textContent = 'Enviar Pedido';
                        fetchAndRenderStocks();
                        return;
                    }

                    // El código de orden viene del servidor (real, único, en BD)
                    orderCode = res.order_code;

                } catch (err) {
                    console.error('Error al crear el pedido en Supabase:', err);
                    showToast('Hubo un problema al registrar el pedido. Por favor intenta de nuevo.', 'error');
                    submitOrderBtn.disabled = false;
                    submitOrderBtn.textContent = 'Enviar Pedido';
                    return;
                }
            } else {
                // Fallback si Supabase no está disponible (solo para desarrollo local)
                orderCode = 'KAY-' + Math.floor(1000 + Math.random() * 9000);
            }

            // Mensaje blindado: el admin busca el código en su panel, no depende del texto del chat
            const botMessage =
                `Hola KAY 🍰, acabo de hacer mi pedido en la web.\n` +
                `Mi código de orden es: *${orderCode}*\n\n` +
                `Por favor, ¿a qué número puedo transferir el pago?`;

            const url = `https://wa.me/653425257?text=${encodeURIComponent(botMessage)}`;
            window.open(url, '_blank');

            orderStatusMsg.innerHTML = `✅ Pedido <strong>${orderCode}</strong> registrado. Redirigiendo a WhatsApp...`;
            orderStatusMsg.className = 'form-msg msg-success';
            orderStatusMsg.style.color = '#25d366';
            orderStatusMsg.style.fontWeight = 'bold';

            setTimeout(() => {
                submitOrderBtn.disabled = false;
                submitOrderBtn.textContent = 'Enviar Pedido';
                cart = [];
                saveCart();
                updateCartUI();
                fetchAndRenderStocks();
                orderModal.style.display = 'none';
            }, 3000);
        });
    }

    // --- Contact Form Validation (Mantiene su funcionalidad) ---
    const contactForm = document.getElementById('contactForm');
    const emailInput = document.getElementById('emailInput');
    const contactMsg = document.getElementById('contactMsg');

    if (contactForm && emailInput && contactMsg) {
        contactForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = emailInput.value.trim();
            const name = document.getElementById('nameInput').value.trim();
            const msg = document.getElementById('messageInput').value.trim();

            const validDomainsRegex = /^[a-zA-Z0-9._%+-]+@(gmail\.com|outlook\.com|hotmail\.com|yahoo\.com|live\.com|icloud\.com)$/i;

            contactMsg.className = 'form-msg';

            if (!validDomainsRegex.test(email)) {
                contactMsg.textContent = '❌ Por favor, ingresa un correo válido (@gmail, @hotmail, @outlook, etc.)';
                contactMsg.classList.add('msg-error');
            } else {
                const botMessage = `NUEVO MENSAJE DE CONTACTO\nNombre: ${name}\nCorreo: ${email}\nMensaje: ${msg}`;
                const url = `https://wa.me/653425257?text=${encodeURIComponent(botMessage)}`;

                // Abrir WhatsApp
                window.open(url, '_blank');

                contactMsg.textContent = '✅ Abriendo WhatsApp para enviar tu mensaje...';
                contactMsg.classList.add('msg-success');
                contactForm.reset();
            }
        });
    }

    // --- Automatic Slideshow Logic ---
    const slideshowTrack = document.getElementById('slideshowTrack');
    if (slideshowTrack) {
        const images = [
            { src: 'edited_1.png', title: 'Tarta de Fresa' },
            { src: 'edited_2.png', title: 'Dulce de Leche' },
            { src: 'edited_3.png', title: 'Postre de Limón' },
            { src: 'edited_4.png', title: 'Decoración Especial' },
            { src: 'edited_5.png', title: 'Postre Tradicional' }
        ];

        const loopImages = [...images, ...images];
        loopImages.forEach(item => {
            const img = document.createElement('img');
            img.src = item.src;
            img.alt = item.title;
            slideshowTrack.appendChild(img);
        });
    }

    // --- Intersection Observer para fade in elements ---
    const productCards = document.querySelectorAll('.product-card');
    const observerOptions = {
        threshold: 0.1,
        rootMargin: "0px 0px -50px 0px"
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = "1";
                entry.target.style.transform = "translateY(0)";
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    productCards.forEach((card, index) => {
        card.style.opacity = "0";
        card.style.transform = "translateY(30px)";
        card.style.transition = `all 0.6s ease ${index * 0.1}s`;
        observer.observe(card);
    });

});
