// Top header bar shared by every portal. Colours come from each portal's own sidebar tokens (--sb-bg, --sb-border,
// --sb-active …), so Head/Admin stay blue, Mentor teal and Mentee indigo.
export const PORTAL_HEADER_CSS = [
  // Sidebar: brand block on top; the logout button moved into the header's profile menu.
  '.sb-brand{display:flex;align-items:center;gap:10px;height:64px;min-height:64px;padding:0 16px;box-sizing:border-box;position:sticky;top:0;z-index:2;background:var(--sb-bg,#fff);border-bottom:1px solid var(--sb-border,#e9ecef);text-decoration:none}',
  '.sb-brand img{width:38px;height:38px;object-fit:contain;flex-shrink:0}',
  '.sb-brand-text{font-size:10.5px;font-weight:700;letter-spacing:.04em;line-height:1.25;text-transform:uppercase;color:var(--sb-active,#2563eb)}',
  '.sidebar-nav{padding-bottom:20px}',

  // Header: fixed to the top of the content area, so it follows the page as it scrolls.
  '.portal-header{position:fixed;top:0;left:var(--sb-width,260px);right:0;height:64px;z-index:90;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 24px;background:var(--sb-bg,#fff);border-bottom:1px solid var(--sb-border,#e9ecef);font-family:var(--font,"DM Sans",system-ui,sans-serif)}',
  '.ph-left{min-width:0}',
  '.ph-title{font-size:15px;font-weight:700;line-height:1.25;color:var(--gray-900,#111827);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.ph-date{font-size:12.5px;line-height:1.3;color:var(--gray-500,#6b7280)}',
  '.ph-user{position:relative;flex-shrink:0}',
  '.ph-avatar{width:40px;height:40px;padding:0;display:flex;align-items:center;justify-content:center;font:inherit;font-size:14px;font-weight:700;color:var(--sb-active-tx,#fff);background:var(--sb-active,#2563eb);border:none;border-radius:50%;cursor:pointer}',
  '.ph-avatar:hover,.ph-avatar[aria-expanded="true"]{box-shadow:0 0 0 3px color-mix(in srgb,var(--sb-active,#2563eb) 25%,transparent)}',
  '.ph-avatar:focus-visible{outline:2px solid var(--sb-active,#2563eb);outline-offset:2px}',
  '.ph-menu{display:none;position:absolute;top:calc(100% + 10px);right:0;width:240px;padding:6px;box-sizing:border-box;background:var(--sb-bg,#fff);border:1px solid var(--sb-border,#e9ecef);border-radius:14px;box-shadow:0 12px 32px rgba(0,0,0,.16)}',
  '.ph-menu.open{display:block}',
  '.ph-menu-id{display:flex;align-items:center;gap:10px;padding:10px;margin-bottom:6px;border-bottom:1px solid var(--sb-border,#e9ecef)}',
  '.ph-menu-avatar{width:36px;height:36px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:var(--sb-active-tx,#fff);background:var(--sb-active,#2563eb);border-radius:50%}',
  '.ph-menu-name{font-size:14px;font-weight:600;color:var(--gray-900,#111827);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.ph-menu-role{font-size:12px;color:var(--gray-500,#6b7280)}',
  '.ph-menu-text{min-width:0}',
  '.ph-item{display:flex;align-items:center;gap:10px;width:100%;padding:10px;font:inherit;font-size:14px;color:var(--sb-item-tx,#374151);text-align:left;background:none;border:none;border-radius:8px;cursor:pointer}',
  '.ph-item i{font-size:18px;color:var(--sb-icon,#6b7280)}',
  '.ph-item:hover{background:var(--sb-item-hover,#f3f4f6)}',
  '.ph-item.danger,.ph-item.danger i{color:var(--danger,#dc2626)}',
  '.ph-item.danger:hover{background:var(--danger-bg,#fef2f2)}',

  // The page content starts below the bar; the mentor/admin concern bell moves left of the profile circle.
  '@media (min-width:769px){html body.portal-has-header .main-wrapper{padding-top:64px}}',
  'html body.portal-has-header .concern-bell{top:12px;right:76px}',

  '@media (max-width:768px){',
  '.portal-header{left:0;height:58px;padding:0 14px 0 62px}',
  '.ph-avatar{width:36px;height:36px;font-size:13px}',
  'html body.portal-has-header .concern-bell{top:9px;right:58px}',
  '}',
  '@media (max-width:480px){',
  '.portal-header{height:52px;padding-left:54px}',
  '.ph-date{display:none}',
  '.ph-avatar{width:34px;height:34px}',
  'html body.portal-has-header .concern-bell{top:6px;right:54px}',
  '}',
  '@media print{.portal-header{display:none!important}html body.portal-has-header .main-wrapper{padding-top:0!important}}',
].join('\n');
