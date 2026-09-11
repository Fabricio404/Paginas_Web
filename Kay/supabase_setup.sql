-- ============================================================
-- KAY POSTRES — SQL COMPLETO PARA SUPABASE (INCLUYE OPCIÓN 2)
-- ============================================================

-- Si tenías tablas viejas de pedidos, bórralas primero descomentando estas líneas:
-- DROP TABLE IF EXISTS audit_log CASCADE;
-- DROP TABLE IF EXISTS pedidos CASCADE;

-- ─────────────────────────────────────────────────────────────
-- 1. TABLAS
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

CREATE INDEX IF NOT EXISTS idx_pedidos_estado_created ON pedidos(estado, created_at);

CREATE TABLE IF NOT EXISTS audit_log (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pedido_id   uuid REFERENCES pedidos(id) ON DELETE CASCADE,
    order_code  text NOT NULL,
    accion      text NOT NULL,
    usuario     text,
    detalle     jsonb,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- 2. PRIVILEGIOS BÁSICOS (GRANTs) - ¡Esto arregla el error de permisos!
-- ─────────────────────────────────────────────────────────────
GRANT ALL ON public.pedidos TO authenticated;
GRANT INSERT ON public.pedidos TO anon;
GRANT ALL ON public.audit_log TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 3. ROW LEVEL SECURITY (RLS)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_insert_pedidos" ON pedidos;
CREATE POLICY "anon_insert_pedidos" ON pedidos FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "auth_full_access_pedidos" ON pedidos;
CREATE POLICY "auth_full_access_pedidos" ON pedidos FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_read_audit_log" ON audit_log;
CREATE POLICY "auth_read_audit_log" ON audit_log FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_audit_log" ON audit_log;
CREATE POLICY "auth_insert_audit_log" ON audit_log FOR INSERT TO authenticated WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────
-- 4. OPCIÓN 2 — FUNCIONES RPC (CON RESERVA DE STOCK)
-- ─────────────────────────────────────────────────────────────

-- 4.1 CREATE PENDING ORDER: Resta el stock temporalmente (Reserva)
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
        IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'message', 'Producto no encontrado: ' || (v_item->>'name')); END IF;
        IF v_product.stock < (v_item->>'qty')::int THEN
            RETURN jsonb_build_object('success', false, 'message', 'Stock insuficiente para: ' || (v_item->>'name') || '. Disponible: ' || v_product.stock);
        END IF;
        v_total := v_total + (v_product.price * (v_item->>'qty')::int);
        
        -- Reservar stock inmediatamente
        UPDATE products SET stock = stock - (v_item->>'qty')::int WHERE name = (v_item->>'name');
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

-- 4.2 CONFIRM ORDER: Ya NO resta stock porque se restó en la reserva
CREATE OR REPLACE FUNCTION confirm_order(p_order_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_pedido record;
BEGIN
    IF auth.uid() IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'No autorizado'); END IF;

    SELECT * INTO v_pedido FROM pedidos WHERE order_code = p_order_code;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'message', 'Pedido no encontrado'); END IF;
    IF v_pedido.estado NOT IN ('pendiente', 'modificado') THEN RETURN jsonb_build_object('success', false, 'message', 'Estado no válido: ' || v_pedido.estado); END IF;

    -- Solo cambia el estado, el stock ya está reservado
    UPDATE pedidos SET estado = 'confirmado', confirmed_at = now(), confirmed_by = auth.uid() WHERE order_code = p_order_code;
    INSERT INTO audit_log (pedido_id, order_code, accion, usuario) VALUES (v_pedido.id, p_order_code, 'confirmado', auth.email());

    RETURN jsonb_build_object('success', true, 'message', 'Pedido confirmado');
END;
$$;

-- 4.3 CANCEL ORDER: Devuelve la reserva al stock
CREATE OR REPLACE FUNCTION cancel_order(p_order_code text, p_motivo text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_pedido record;
    v_item jsonb;
BEGIN
    IF auth.uid() IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'No autorizado'); END IF;

    SELECT * INTO v_pedido FROM pedidos WHERE order_code = p_order_code;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'message', 'Pedido no encontrado'); END IF;
    IF v_pedido.estado = 'confirmado' THEN RETURN jsonb_build_object('success', false, 'message', 'No se puede cancelar un pedido confirmado'); END IF;

    -- Devolver los productos al stock masivamente (evita N+1)
    UPDATE products p
    SET stock = p.stock + (i.value->>'qty')::int
    FROM jsonb_array_elements(v_pedido.productos) AS i(value)
    WHERE p.name = i.value->>'name';

    UPDATE pedidos SET estado = 'cancelado', notas = p_motivo WHERE order_code = p_order_code;
    INSERT INTO audit_log (pedido_id, order_code, accion, usuario, detalle) VALUES (v_pedido.id, p_order_code, 'cancelado', auth.email(), jsonb_build_object('motivo', p_motivo));

    RETURN jsonb_build_object('success', true, 'message', 'Pedido cancelado y stock liberado');
END;
$$;

-- 4.4 EDIT ORDER: Ajusta la reserva de stock según el cambio
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
    IF auth.uid() IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'No autorizado'); END IF;
    SELECT * INTO v_pedido FROM pedidos WHERE order_code = p_order_code;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'message', 'Pedido no encontrado'); END IF;
    IF v_pedido.estado IN ('confirmado', 'cancelado') THEN RETURN jsonb_build_object('success', false, 'message', 'No se puede editar en este estado'); END IF;

    -- Paso 1: Devolver todo el stock anterior
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_pedido.productos)
    LOOP
        UPDATE products SET stock = stock + (v_item->>'qty')::int WHERE name = (v_item->>'name');
    END LOOP;

    -- Paso 2: Validar y reservar el stock con las nuevas cantidades
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_new_items)
    LOOP
        SELECT * INTO v_product FROM products WHERE name = (v_item->>'name');
        IF v_product.stock < (v_item->>'qty')::int THEN
            -- Revertir el Paso 1 si falla
            FOR v_item IN SELECT * FROM jsonb_array_elements(v_pedido.productos) LOOP
                UPDATE products SET stock = stock - (v_item->>'qty')::int WHERE name = (v_item->>'name');
            END LOOP;
            RETURN jsonb_build_object('success', false, 'message', 'Stock insuficiente para: ' || (v_item->>'name'));
        END IF;
        
        v_new_total := v_new_total + (v_product.price * (v_item->>'qty')::int);
        UPDATE products SET stock = stock - (v_item->>'qty')::int WHERE name = (v_item->>'name');
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
-- 5. OPCIÓN 2 — CRON JOB PARA CANCELAR PEDIDOS CADUCADOS (30 min)
-- ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION auto_cancel_expired_orders()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- 1. Devolver el stock masivamente de todos los pedidos caducados
    UPDATE products p
    SET stock = p.stock + (i.value->>'qty')::int
    FROM pedidos ped, jsonb_array_elements(ped.productos) AS i(value)
    WHERE ped.estado = 'pendiente'
      AND ped.created_at < NOW() - INTERVAL '30 minutes'
      AND p.name = i.value->>'name';

    -- 2. Marcar como cancelados todos esos pedidos masivamente
    UPDATE pedidos
    SET estado = 'cancelado',
        notas = 'Cancelado automáticamente por caducidad (30 mins)'
    WHERE estado = 'pendiente'
      AND created_at < NOW() - INTERVAL '30 minutes';
END;
$$;

-- Ejecutar cada 5 minutos
SELECT cron.schedule('auto-cancel-job', '*/5 * * * *', 'SELECT auto_cancel_expired_orders()');
