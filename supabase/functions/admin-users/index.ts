import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

function resolveCorsOrigin(req: Request) {
  const requestOrigin = req.headers.get("Origin") || ""
  const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean)

  if (allowedOrigins.length === 0) return "*"
  return allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0]
}

function isOriginAllowed(req: Request) {
  const requestOrigin = req.headers.get("Origin") || ""
  const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean)

  return allowedOrigins.length === 0 || !requestOrigin || allowedOrigins.includes(requestOrigin)
}

function corsHeaders(req: Request) {
  return {
    "Access-Control-Allow-Origin": resolveCorsOrigin(req),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  }
}

const allowedRoles = new Set(["admin", "executer", "sales"])

function json(req: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  })
}

function required(value: unknown, label: string) {
  const text = String(value || "").trim()
  if (!text) throw new Error(`${label} is required`)
  return text
}

serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) })
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405)
  if (!isOriginAllowed(req)) return json(req, { error: "Origin is not allowed" }, 403)

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    if (!supabaseUrl || !serviceKey) {
      return json(req, { error: "Admin function is missing Supabase server environment variables" }, 500)
    }

    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "")
    if (!token) return json(req, { error: "Missing authorization token" }, 401)

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: userData, error: userError } = await admin.auth.getUser(token)
    if (userError || !userData.user) return json(req, { error: "Invalid authorization token" }, 401)

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .maybeSingle()

    if (profileError) throw new Error(profileError.message)
    if (profile?.role !== "admin") return json(req, { error: "Only admins can manage employee logins" }, 403)

    const body = await req.json()
    const action = required(body.action, "action")

    if (action === "createUser") {
      const email = required(body.email, "email").toLowerCase()
      const password = required(body.password, "password")
      const fullName = required(body.fullName, "fullName")
      const role = required(body.role, "role")
      if (!allowedRoles.has(role)) throw new Error("Invalid role")

      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, role },
      })
      if (error) throw new Error(error.message)

      await admin.from("profiles").upsert({
        id: data.user.id,
        email,
        full_name: fullName,
        role,
      }, { onConflict: "id" })

      return json(req, { user: { id: data.user.id, email, full_name: fullName, role } })
    }

    if (action === "updateUserEmail") {
      const userId = required(body.userId, "userId")
      const email = required(body.email, "email").toLowerCase()
      const { error } = await admin.auth.admin.updateUserById(userId, { email, email_confirm: true })
      if (error) throw new Error(error.message)
      await admin.from("profiles").update({ email }).eq("id", userId)
      return json(req, { ok: true })
    }

    if (action === "resetPassword") {
      const userId = required(body.userId, "userId")
      const password = required(body.password, "password")
      const { error } = await admin.auth.admin.updateUserById(userId, { password })
      if (error) throw new Error(error.message)
      return json(req, { ok: true })
    }

    if (action === "deleteUser") {
      const userId = required(body.userId, "userId")
      const { error } = await admin.auth.admin.deleteUser(userId)
      if (error) throw new Error(error.message)
      await admin.from("profiles").delete().eq("id", userId)
      return json(req, { ok: true })
    }

    return json(req, { error: "Unknown admin action" }, 400)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "Admin user action failed")
    return json(req, { error: message }, 400)
  }
})
