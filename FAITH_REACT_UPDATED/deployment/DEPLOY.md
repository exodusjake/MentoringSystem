# Deploying the React frontend (EC2 + Nginx)

The backend and RDS stay as they are. Only the static site changes.

## 1. Upload the build
```powershell
.\deployment\deploy-frontend.ps1
```
Builds with `VITE_API_BASE_URL` set to the real API and uploads `dist/` to `/var/www/astra-react` on the server.
The live site in `/var/www/astra` is not touched.

## 2. Switch Nginx to the new folder (on the server, via SSH)
```bash
sudo cp /etc/nginx/conf.d/*.conf ~/nginx-backup/   # or wherever your site config is; keep a copy
sudo nano /etc/nginx/conf.d/<your-site>.conf
```
In the `server` block that serves the site:
- change `root /var/www/astra;` to `root /var/www/astra-react;`
- make unknown paths fall back to the app (React Router):
  ```
  location / {
      try_files $uri $uri/ /index.html;
  }
  ```
- keep the existing `location /api/ { ... }` block (and `client_max_body_size 22m;`) unchanged.
```bash
sudo nginx -t && sudo systemctl reload nginx
```
Hard-refresh the browser (Ctrl+Shift+R).

## Roll back
Set `root` back to `/var/www/astra;`, then `sudo nginx -t && sudo systemctl reload nginx`.

## Notes
- Old links like `/MENTEE/HTML/announcements.html?id=3` redirect to the new routes (they no longer exist as files, so Nginx must
  fall back to `index.html`, as above).
- No CORS change is needed when the site and API share the same origin, as before.
- `Frontend:BaseUrl` in the backend config should stay the site's address, so e-mail links keep working.
- If the site and API are on different origins, add the site's origin to `Cors:AllowedOrigins` on the backend.
