import { createServer as createHttpServer, type Server } from "node:http"
import { createServer as createNetServer } from "node:net"
import { URL } from "node:url"
import { debug } from "./log.js"

let server: Server | null = null

async function findAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createNetServer()
    srv.listen(0, () => {
      const addr = srv.address()
      if (addr && typeof addr === "object") {
        const port = addr.port
        srv.close(() => resolve(port))
      } else {
        reject(new Error("Could not find available port"))
      }
    })
    srv.on("error", reject)
  })
}

export async function startOAuthServer(): Promise<{
  port: number
  codePromise: Promise<string>
}> {
  const port = await findAvailablePort()

  const codePromise = new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("OAuth callback timed out after 5 minutes"))
    }, 5 * 60 * 1000)

    server = createHttpServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost:${port}`)

      if (url.pathname !== "/callback") {
        res.writeHead(404)
        res.end("Not found")
        return
      }

      clearTimeout(timeout)
      const code = url.searchParams.get("code")

      if (!code) {
        res.writeHead(400)
        res.end("Missing authorization code")
        reject(new Error("No authorization code received"))
        return
      }

      res.writeHead(200, { "Content-Type": "text/html" })
      res.end(
        "<html><body><h2>Authorization successful!</h2><p>You can close this tab and return to the terminal.</p></body></html>"
      )
      debug("oauth", "code received")
      resolve(code)
    })

    server.listen(port, () => {
      debug("oauth", `listening on port ${port}`)
    })
  })

  return { port, codePromise }
}

export async function stopOAuthServer(): Promise<void> {
  if (server) {
    await new Promise<void>((resolve) => {
      server!.close(() => resolve())
    })
    server = null
  }
}
