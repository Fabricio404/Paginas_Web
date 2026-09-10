-- ============================================================
-- KAY POSTRES — SQL COMPLETO PARA SUPABASE
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. TABLA: pedidos
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pedidos (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_code       text UNIQUE NOT NULL,
    cliente_nombre   text NOT NULL,
    cliente_telefono text NOT NULL,
    productos        jsonb NOT NULL,
    total            numeric(10, 2) DEFAULT 0,
    estado           text NOT NULL DEFAULT 'pendiente'
                     CHECK (estado IN ('pendiente', 'confirmado', 'cancelado', 'modificado')),
    notas            text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    confirmed_at     timestamptz,
    confirmed_by     uuid REFERENCES auth.users(id)
);

-- ─────────────────────────────────────────────────────────────
-- 2. TABLA: audit_log (historial de acciones del admin)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pedido_id   uuid REFERENCES pedidos(id) ON DELETE CASCADE,
    order_code  text NOT NULL,
    accion      text NOT NULL,  -- confirmado | cancelado | modificado | creado
    usuario     text,           -- email del admin que realizó la acción
    detalle     jsonb,          -- { "antes": {...}, "despues": {...} }
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- 3. ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────
ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;

-- Clientes anónimos solo pueden INSERTAR (via RPC, no directamente)
CREATE POLICY "anon_insert_pedidos"
    ON pedidos FOR INSERT TO anon WITH CHECK (true);

-- Admins autenticados tienen acceso total
CREATE POLICY "auth_full_access_pedidos"
    ON pedidos FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_audit_log"
    ON audit_log FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_insert_audit_log"
    ON audit_log FOR INSERT TO authenticated WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────
-- 4. RPC: create_pending_order (llamada por el cliente — NO resta stock)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_pending_order(
    p_items    jsonb,
    p_nombre   text,
    p_telefono text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_order_code text;
    v_item       jsonb;
    v_product    record;
    v_total      numeric := 0;
BEGIN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        SELECT * INTO v_product FROM products WHERE name = (v_item->>'name');
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'message', 'Producto no encontrado: ' || (v_item->>'name'));
        END IF;
        IF v_product.stock < (v_item->>'qty')::int THEN
            RETURN jsonb_build_object('success', false, 'message',
                'Stock insuficiente para: ' || (v_item->>'name') || '. Disponible: ' || v_product.stock);
        END IF;
        v_total := v_total + (v_product.price * (v_item->>'qty')::int);
    END LOOP;

    v_order_code := 'KAY-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::text, 4, '0');
    WHILE EXISTS (SELECT 1 FROM pedidos WHERE order_code = v_order_code) LOOP
        v_order_code := 'KAY-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::text, 4, '0');
    END LOOP;

    INSERT INTO pedidos (order_code, cliente_nombre, cliente_telefono, productos, total)
    VALUES (v_order_code, p_nombre, p_telefono, p_items, v_total);

    RETURN jsonb_build_object('success', true, 'order_code', v_order_code, 'total', v_total);
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 5. RPC: confirm_order (solo admin — AQUÍ sí se resta el stock)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION confirm_order(p_order_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_pedido  record;
    v_item    jsonb;
    v_product record;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'No autorizado');
    END IF;

    SELECT * INTO v_pedido FROM pedidos WHERE order_code = p_order_code;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Pedido no encontrado');
    END IF;
    IF v_pedido.estado NOT IN ('pendiente', 'modificado') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Estado no válido para confirmar: ' || v_pedido.estado);
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(v_pedido.productos)
    LOOP
        SELECT * INTO v_product FROM products WHERE name = (v_item->>'name');
        IF v_product.stock < (v_item->>'qty')::int THEN
            RETURN jsonb_build_object('success', false, 'message', 'Stock insuficiente al confirmar: ' || (v_item->>'name'));
        END IF;
        UPDATE products SET stock = stock - (v_item->>'qty')::int WHERE name = (v_item->>'name');
    END LOOP;

    UPDATE pedidos SET estado = 'confirmado', confirmed_at = now(), confirmed_by = auth.uid()
    WHERE order_code = p_order_code;

    INSERT INTO audit_log (pedido_id, order_code, accion, usuario)
    VALUES (v_pedido.id, p_order_code, 'confirmado', auth.email());

    RETURN jsonb_build_object('success', true, 'message', 'Pedido confirmado y stock actualizado');
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 6. RPC: cancel_order
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION cancel_order(p_order_code text, p_motivo text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_pedido record;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'No autorizado');
    END IF;
    SELECT * INTO v_pedido FROM pedidos WHERE order_code = p_order_code;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Pedido no encontrado');
    END IF;
    IF v_pedido.estado = 'confirmado' THEN
        RETURN jsonb_build_object('success', false, 'message', 'No se puede cancelar un pedido ya confirmado');
    END IF;

    UPDATE pedidos SET estado = 'cancelado', notas = p_motivo WHERE order_code = p_order_code;

    INSERT INTO audit_log (pedido_id, order_code, accion, usuario, detalle)
    VALUES (v_pedido.id, p_order_code, 'cancelado', auth.email(), jsonb_build_object('motivo', p_motivo));

    RETURN jsonb_build_object('success', true, 'message', 'Pedido cancelado');
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 7. RPC: edit_order
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION edit_order(
    p_order_code text,
    p_new_items  jsonb,
    p_notas      text DEFAULT ''
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_pedido    record;
    v_item      jsonb;
    v_product   record;
    v_new_total numeric := 0;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'No autorizado');
    END IF;
    SELECT * INTO v_pedido FROM pedidos WHERE order_code = p_order_code;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Pedido no encontrado');
    END IF;
    IF v_pedido.estado IN ('confirmado', 'cancelado') THEN
        RETURN jsonb_build_object('success', false, 'message', 'No se puede editar en estado: ' || v_pedido.estado);
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_new_items)
    LOOP
        SELECT * INTO v_product FROM products WHERE name = (v_item->>'name');
        IF v_product.stock < (v_item->>'qty')::int THEN
            RETURN jsonb_build_object('success', false, 'message', 'Stock insuficiente para: ' || (v_item->>'name'));
        END IF;
        v_new_total := v_new_total + (v_product.price * (v_item->>'qty')::int);
    END LOOP;

    INSERT INTO audit_log (pedido_id, order_code, accion, usuario, detalle)
    VALUES (v_pedido.id, p_order_code, 'modificado', auth.email(),
            jsonb_build_object('antes', v_pedido.productos, 'despues', p_new_items, 'notas', p_notas));

    UPDATE pedidos SET productos = p_new_items, total = v_new_total, estado = 'modificado', notas = p_notas
    WHERE order_code = p_order_code;

    RETURN jsonb_build_object('success', true, 'nuevo_total', v_new_total, 'message', 'Pedido actualizado');
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- NOTA: Si tu tabla products no tiene columna "price", añádela:
-- ALTER TABLE products ADD COLUMN IF NOT EXISTS price numeric(10,2) DEFAULT 0;
-- ─────────────────────────────────────────────────────────────
