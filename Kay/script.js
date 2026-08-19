document.addEventListener('DOMContentLoaded', () => {

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

    // --- Lógica del Carrito ---
    const addToCartBtns = document.querySelectorAll('.add-to-cart');
    
    addToCartBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const productName = this.getAttribute('data-product');
            const qtyInput = this.parentElement.querySelector('.item-qty');
            const qty = qtyInput ? parseInt(qtyInput.value) || 1 : 1;
            
            const existingItem = cart.find(item => item.name === productName);
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
            
            if(cartBtn) {
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
        if(!cartCountElement) return;

        const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);
        cartCountElement.textContent = totalItems;

        if(!cartItemsContainer) return;

        cartItemsContainer.innerHTML = '';

        if (cart.length === 0) {
            cartItemsContainer.innerHTML = '<p class="empty-cart-msg">Tu cesta está vacía.</p>';
            if(checkoutBtn) checkoutBtn.disabled = true;
            if(clearCartBtn) clearCartBtn.style.display = 'none';
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
            if(checkoutBtn) checkoutBtn.disabled = false;
            if(clearCartBtn) clearCartBtn.style.display = 'block';

            // Event Listeners para botones de la cesta
            document.querySelectorAll('.qty-btn.minus').forEach(btn => {
                btn.addEventListener('click', function() {
                    const idx = this.getAttribute('data-index');
                    if(cart[idx].qty > 1) {
                        cart[idx].qty -= 1;
                    } else {
                        cart.splice(idx, 1);
                    }
                    saveCart();
                    updateCartUI();
                });
            });
            
            document.querySelectorAll('.qty-btn.plus').forEach(btn => {
                btn.addEventListener('click', function() {
                    const idx = this.getAttribute('data-index');
                    if(cart[idx].qty < 80) cart[idx].qty += 1;
                    saveCart();
                    updateCartUI();
                });
            });

            document.querySelectorAll('.remove-item').forEach(btn => {
                btn.addEventListener('click', function() {
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

    if (checkoutBtn && orderModal && cartModal) {
        checkoutBtn.addEventListener('click', () => {
            cartModal.style.display = 'none';
            orderModal.style.display = 'block';
            if(orderStatusMsg) orderStatusMsg.textContent = '';
        });
    }

    if (closeOrderModal && orderModal) {
        closeOrderModal.addEventListener('click', () => orderModal.style.display = 'none');
    }

    window.addEventListener('click', (e) => {
        if (e.target === cartModal) cartModal.style.display = 'none';
        if (e.target === orderModal) orderModal.style.display = 'none';
    });

    // --- Enviar Pedido vía WhatsApp (CallMeBot) ---
    if (orderForm) {
        orderForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const name = document.getElementById('orderName').value.trim();
            const phone = document.getElementById('orderPhone').value.trim();
            
            if(!name || !phone || cart.length === 0) return;

            submitOrderBtn.disabled = true;
            submitOrderBtn.textContent = 'Enviando...';

            // Generar número de pedido aleatorio (ej. #4921)
            const orderNumber = Math.floor(1000 + Math.random() * 9000);

            // Formatear lista de productos
            let productListStr = '';
            cart.forEach(item => {
                productListStr += `- ${item.qty}x ${item.name}\n`;
            });

            const botMessage = `NUEVO PEDIDO #${orderNumber}\nCliente: ${name}\nTelefono: ${phone}\n\nPRODUCTOS:\n${productListStr}`;
            const url = `https://wa.me/000000000?text=${encodeURIComponent(botMessage)}`;

            // Abrir WhatsApp de forma oficial
            window.open(url, '_blank');

            orderStatusMsg.innerHTML = '✅ Redirigiendo a WhatsApp...';
            orderStatusMsg.className = 'form-msg msg-success';
            orderStatusMsg.style.color = '#25d366';
            orderStatusMsg.style.fontWeight = 'bold';
            
            setTimeout(() => {
                submitOrderBtn.disabled = false;
                submitOrderBtn.textContent = 'Enviar Pedido';
                // Vaciar carrito tras enviar pedido
                cart = [];
                saveCart();
                updateCartUI();
                orderModal.style.display = 'none';
            }, 2000);
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
                const url = `https://wa.me/000000000?text=${encodeURIComponent(botMessage)}`;
                
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
