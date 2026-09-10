(()=>{var u="openchamber.sdk",x=1;var H=(o)=>Boolean(o&&"sessionId"in o),N=(o)=>Boolean(o&&"sent"in o&&!("sessionId"in o));var mo=16000,ho=128,$o=200,wo=2000,go=16000,vo=80,To=200;var zo=2000;var R=20000,yo=["HOST_UNAVAILABLE","HOST_TIMEOUT","HOST_REJECTED","DISCONNECTED","DISABLED","BAD_PATH","NO_INTEGRATION","NO_SERVICE","SERVICE_FAILED","NO_SESSION","SESSION_BUSY","NOT_GRANTED"],So=["stopped","starting","ready","failed"],Lo=new Set(yo),Uo=(o)=>Lo.has(o),Go=(o)=>o&&Uo(o)?o:"HOST_REJECTED",xo=(o)=>o?.trim().slice(0,To)??"",M=(o)=>{let t=o.id.trim().slice(0,ho),c=o.title.trim().slice(0,$o),a=o.url.trim().slice(0,wo),p=o.text?.trim().slice(0,go),e=o.author?.trim().slice(0,vo),i=o.kind==="pull"?"pull":"issue",n={providerId:o.providerId.trim(),id:t,title:c||t,url:a,kind:i};if(p)n.text=p;if(e)n.author=e;if(i==="pull"){let h=xo(o.branches?.head),b=xo(o.branches?.base);if(h&&b)n.branches={head:h,base:b}}return n},oo=(o)=>{let t=M(o);if(o.worktree)t.worktree=!0;return t},to=(o)=>{let t={text:o.text.trim().slice(0,mo)};if(o.send)t.send=!0;return t};var A=(o)=>{if(!o.startsWith("/")||o.includes("\x00")||o.includes("\\")||o.includes("://"))return!1;if(o.length>zo)return!1;return!o.split("/").some((c)=>c==="."||c==="..")},Io=new Set(So),co=(o)=>Boolean(o&&"status"in o&&Io.has(String(o.status))&&!("body"in o)),B=(o)=>Boolean(o&&"status"in o&&"body"in o&&Number.isInteger(o.status)),Mo=new Set(["ready","directory","session","connection","settings","session-lifecycle"]),Do=(o)=>Object(o)===o?o:null,E=(o)=>String(o)===o&&o.length>0,Vo=(o)=>{if(!E(o.id))return null;if(o.ok===!0){let t={channel:u,v:x,type:"result",id:o.id,ok:!0};if(Object(o.payload)===o.payload)t.payload=o.payload;return t}if(o.ok===!1&&E(o.error))return{channel:u,v:x,type:"result",id:o.id,ok:!1,error:o.error,code:Go(E(o.code)?o.code:void 0)};return null},ro=(o)=>{let t=Do(o);if(!t||t.channel!==u||t.v!==x)return null;if(t.type==="result")return Vo(t);if(!Mo.has(String(t.type))||Object(t.payload)!==t.payload)return null;return t};class T extends Error{code;constructor(o,t){super(t);this.name="HostRequestError",this.code=o}}var Xo=()=>Promise.reject(new T("BAD_PATH",'Request path must start with "/" and stay on the declared origin.')),v=(o)=>{return o.value+=1,`oc-${o.value}`},ao=(o={})=>{let t=o.target??("window"in globalThis?window:null);if(!t)throw new T("HOST_UNAVAILABLE","No window. connectHost runs in a browser frame.");let c=o.acceptSource??((d)=>d===t.parent),a=o.requestTimeoutMs??R,p=new Set,e=new Set,i=new Set,n=new Set,h=new Set,b=new Set,y=new Map,k={value:0},f=null,F=null,lo=(d)=>{if(!d)return null;return{sessionId:d.id,phase:d.busy?"started":"completed"}},bo=(d)=>{t.parent.postMessage(d,"*")},U=(d,r)=>{for(let Y of d)try{Y(r)}catch(q){console.error(q)}},uo=(d)=>{if(!(d instanceof MessageEvent))return;if(!c(d.source))return;let r=ro(d.data);if(!r)return;if(r.type==="ready"){if(f=r.payload,F=lo(r.payload.session),U(p,r.payload),U(e,r.payload.directory),U(i,r.payload.session),F)U(n,F);U(h,r.payload.connection),U(b,r.payload.settings);return}if(r.type==="directory"){if(f)f={...f,directory:r.payload.directory};U(e,r.payload.directory);return}if(r.type==="session"){if(f)f={...f,session:r.payload.session};if(!r.payload.session)F=null;else if(F?.sessionId!==r.payload.session.id)F=lo(r.payload.session);U(i,r.payload.session);return}if(r.type==="session-lifecycle"){F=r.payload,U(n,r.payload);return}if(r.type==="connection"){if(f)f={...f,connection:r.payload.connection};U(h,r.payload.connection);return}if(r.type==="settings"){if(f)f={...f,settings:r.payload.settings};U(b,r.payload.settings);return}let Y=y.get(r.id);if(!Y)return;if(clearTimeout(Y.timer),y.delete(r.id),r.ok){Y.resolve(r.payload);return}Y.reject(new T(r.code,r.error))};t.addEventListener("message",uo),bo({channel:u,v:x,type:"hello"});let L=(d)=>{if(t.parent===t)return Promise.reject(new T("HOST_UNAVAILABLE","No host frame. This page is not in an iframe."));return new Promise((r,Y)=>{let q=setTimeout(()=>{y.delete(d.id),Y(new T("HOST_TIMEOUT","Host did not answer in time."))},a);y.set(d.id,{resolve:r,reject:Y,timer:q}),bo(d)})},X=(d)=>L(d).then(()=>{return});return{onReady:(d)=>{if(p.add(d),f)d(f);return()=>{p.delete(d)}},onDirectory:(d)=>{if(e.add(d),f)d(f.directory);return()=>{e.delete(d)}},onSession:(d)=>{if(i.add(d),f)d(f.session);return()=>{i.delete(d)}},onSessionLifecycle:(d)=>{if(n.add(d),F)d(F);return()=>{n.delete(d)}},onConnection:(d)=>{if(h.add(d),f)d(f.connection);return()=>{h.delete(d)}},onSettings:(d)=>{if(b.add(d),f)d(f.settings);return()=>{b.delete(d)}},toast:(d)=>X({channel:u,v:x,type:"toast",id:v(k),payload:d}),openUrl:(d)=>X({channel:u,v:x,type:"open-url",id:v(k),payload:{url:d}}),openSurface:(d)=>X({channel:u,v:x,type:"open-surface",id:v(k),payload:{surfaceId:d}}),writeClipboard:(d)=>X({channel:u,v:x,type:"clipboard-write",id:v(k),payload:{text:d}}),compose:(d)=>X({channel:u,v:x,type:"compose",id:v(k),payload:d}),attach:(d)=>X({channel:u,v:x,type:"attach",id:v(k),payload:M(d)}),startSession:(d)=>L({channel:u,v:x,type:"start-session",id:v(k),payload:oo(d)}).then((r)=>{if(!H(r))throw new T("HOST_REJECTED","Host did not return a session.");return r}),prompt:(d)=>L({channel:u,v:x,type:"prompt",id:v(k),payload:to(d)}).then((r)=>{if(!N(r))throw new T("HOST_REJECTED","Host did not return a prompt result.");return r}),sessionLink:(d)=>X({channel:u,v:x,type:"session-link",id:v(k),payload:M(d)}),close:()=>X({channel:u,v:x,type:"close",id:v(k)}),oauthStart:()=>X({channel:u,v:x,type:"oauth-start",id:v(k)}),oauthDisconnect:()=>X({channel:u,v:x,type:"oauth-disconnect",id:v(k)}),request:(d)=>(A(d.path)?L({channel:u,v:x,type:"request",id:v(k),payload:d}):Xo()).then((r)=>{if(!B(r))throw new T("HOST_REJECTED","Host request result was empty.");return r}),serviceRequest:(d)=>(A(d.path)?L({channel:u,v:x,type:"service-request",id:v(k),payload:d}):Xo()).then((r)=>{if(!B(r))throw new T("HOST_REJECTED","Host service request result was empty.");return r}),serviceStatus:()=>L({channel:u,v:x,type:"service-status",id:v(k)}).then((d)=>{if(!co(d))throw new T("HOST_REJECTED","Host did not return service status.");return d}),dispose:()=>{t.removeEventListener("message",uo);for(let d of y.values())clearTimeout(d.timer),d.reject(new T("HOST_UNAVAILABLE","Host client was disposed."));y.clear(),p.clear(),e.clear(),i.clear(),n.clear(),h.clear(),b.clear()}}};var Ao=[["--oc-bg","background"],["--oc-elevated","elevated"],["--oc-fg","foreground"],["--oc-muted","muted"],["--oc-subtle","subtle"],["--oc-border","border"],["--oc-hover","hover"],["--oc-selection","selection"],["--oc-focus","focus"],["--oc-primary","primary"],["--oc-muted-surface","mutedSurface"],["--oc-elevated-fg","elevatedForeground"],["--oc-active","active"],["--oc-selection-fg","selectionForeground"],["--oc-primary-fg","primaryForeground"],["--oc-success","success"],["--oc-warning","warning"],["--oc-error","error"],["--oc-info","info"],["--oc-font","font"],["--oc-mono","mono"],["--oc-radius","radius"],["--surface-background","background"],["--surface-elevated","elevated"],["--surface-foreground","foreground"],["--surface-muted-foreground","muted"],["--surface-subtle","subtle"],["--interactive-border","border"],["--interactive-hover","hover"],["--interactive-selection","selection"],["--interactive-focus-ring","focus"],["--primary","primary"],["--surface-muted","mutedSurface"],["--surface-elevated-foreground","elevatedForeground"],["--interactive-active","active"],["--interactive-selection-foreground","selectionForeground"],["--primary-foreground","primaryForeground"],["--status-success","success"],["--status-warning","warning"],["--status-error","error"],["--status-info","info"],["--font-sans","font"],["--font-mono","mono"],["--radius","radius"]],Fo=(o,t)=>{t.style.colorScheme=o.mode;for(let[c,a]of Ao)t.style.setProperty(c,o.tokens[a])},no=(o,t)=>{if(Fo(o.theme,t),t.dataset)t.dataset.ocSurface=o.surface,t.dataset.ocTheme=o.theme.mode};var I=(o)=>{while(o.firstChild)o.removeChild(o.firstChild)},w=(o)=>{let t=document.getElementById("oc-sdk-ui-style");if(t instanceof HTMLStyleElement){if(t.textContent!==o)t.textContent=o;return}let c=document.createElement("style");c.id="oc-sdk-ui-style",c.textContent=o,document.head.appendChild(c)},s=(o,t)=>{let c=document.createElement(o);if(t)c.className=t;return c},Z=(o)=>{let t=s("button",o);return t.type="button",t},z=(o,t)=>{let c=t??"";if(o.textContent!==c)o.textContent=c},C=(o,t,c)=>{if(c===void 0||c===null||c==="")o.removeAttribute(t);else if(o.getAttribute(t)!==c)o.setAttribute(t,c)};var Bo={"surface-background":"bg","surface-elevated":"elevated","surface-elevated-foreground":"elevated-fg","surface-foreground":"fg","surface-muted-foreground":"muted","surface-subtle":"subtle","interactive-border":"border","interactive-hover":"hover","interactive-active":"active","interactive-selection":"selection","interactive-selection-foreground":"selection-fg","interactive-focus-ring":"focus",primary:"primary","primary-foreground":"primary-fg","status-success":"success","status-warning":"warning","status-error":"error","status-info":"info","font-sans":"font","font-mono":"mono",radius:"radius"},l=(o,t)=>`var(--${o}, var(--oc-${Bo[o]}, ${t}))`,j=l("surface-background","transparent"),K=l("surface-elevated","transparent"),Ko=l("surface-elevated-foreground","inherit"),Q=l("surface-foreground","inherit"),m=l("surface-muted-foreground","gray"),_o=l("surface-subtle","transparent"),G=l("interactive-border","currentColor"),W=l("interactive-hover","transparent"),eo=l("interactive-active","transparent"),Yo=l("interactive-selection","transparent"),Qo=l("interactive-selection-foreground","inherit"),Wo=l("interactive-focus-ring","currentColor"),S=l("primary","currentColor"),Po=l("font-sans","inherit"),io=l("font-mono","monospace"),Jo=l("radius","9px"),$=(o,t,c="transparent")=>`color-mix(in srgb, ${o} ${t}%, ${c})`,Zo=`box-shadow: 0 0 0 2px ${Wo};`,_=(o)=>{let t=l(`status-${o}`,"currentColor");return`
.oc-sdk[data-tone="${o}"], .oc-sdk [data-tone="${o}"] { --oc-sdk-tone: ${t}; }`},g=`
.oc-sdk { box-sizing: border-box; color: ${Q}; font-family: ${Po}; font-size: 0.875rem; line-height: 1.45; }
.oc-sdk *, .oc-sdk *::before, .oc-sdk *::after { box-sizing: border-box; }
/* :where() keeps the reset at zero specificity so every primitive class below overrides it. */
:where(.oc-sdk) :where(button, input, textarea), :where(button.oc-sdk, input.oc-sdk, textarea.oc-sdk) { font: inherit; color: inherit; margin: 0; }
:where(.oc-sdk) :where(button), :where(button.oc-sdk) { cursor: pointer; background: none; border: 0; padding: 0; }
.oc-sdk button:disabled, button.oc-sdk:disabled, .oc-sdk[aria-disabled="true"], .oc-sdk [aria-disabled="true"] { opacity: .5; pointer-events: none; }
.oc-sdk :focus-visible { outline: none; ${Zo} }
.oc-sdk-mono { font-family: ${io}; }
.oc-sdk-muted { color: ${m}; }
${_("success")}${_("warning")}${_("error")}${_("info")}
.oc-sdk[data-tone="primary"], .oc-sdk [data-tone="primary"] { --oc-sdk-tone: ${S}; }

.oc-sdk-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 36px; padding: 0 14px; border: 1px solid transparent; border-radius: ${Jo}; font-size: 0.875rem; font-weight: 500; line-height: 1; white-space: nowrap; transition: background 150ms ease-out, color 150ms ease-out; }
.oc-sdk-btn[data-size="sm"] { height: 32px; padding: 0 10px; font-size: 0.8125rem; }
.oc-sdk-btn[data-size="xs"] { height: 24px; padding: 0 8px; font-size: 0.75rem; border-radius: 6px; }
.oc-sdk-btn[data-variant="default"] { color: ${S}; background: ${$(S,10,j)}; border-color: ${$(S,12)}; }
.oc-sdk-btn[data-variant="default"]:hover { background: ${$(S,16,j)}; }
.oc-sdk-btn[data-variant="default"]:active { background: ${$(S,22,j)}; }
.oc-sdk-btn[data-variant="secondary"] { background: ${W}; }
.oc-sdk-btn[data-variant="secondary"]:hover { background: ${eo}; }
.oc-sdk-btn[data-variant="outline"] { background: ${K}; border-color: ${G}; }
.oc-sdk-btn[data-variant="outline"]:hover { background: ${W}; }
.oc-sdk-btn[data-variant="ghost"] { background: transparent; }
.oc-sdk-btn[data-variant="ghost"]:hover { background: ${W}; }
.oc-sdk-btn[data-variant="ghost"]:active { background: ${eo}; }
.oc-sdk-btn[data-variant="destructive"] { --oc-sdk-tone: ${l("status-error","red")}; color: var(--oc-sdk-tone); background: ${$("var(--oc-sdk-tone)",7,j)}; border-color: ${$("var(--oc-sdk-tone)",12)}; }
.oc-sdk-btn[data-variant="destructive"]:hover { background: ${$("var(--oc-sdk-tone)",9,j)}; }
.oc-sdk-btn[data-variant="destructive"]:active { background: ${$("var(--oc-sdk-tone)",11,j)}; }
.oc-sdk-btn[data-loading="true"] { opacity: .5; pointer-events: none; }
.oc-sdk-btn > .oc-sdk-spinner-ring { width: 14px; height: 14px; }

.oc-sdk-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.oc-sdk-field-label { font-size: 0.8125rem; font-weight: 500; }
.oc-sdk-field-note { font-size: 0.75rem; color: ${m}; }
.oc-sdk-field[data-invalid="true"] .oc-sdk-field-note { color: ${l("status-error","red")}; }
.oc-sdk-input { display: block; width: 100%; min-width: 0; height: 36px; padding: 0 12px; border: 0; border-radius: ${Jo}; background: ${K}; color: ${Q}; font-size: 0.875rem; line-height: 1.45; appearance: none; box-shadow: inset 0 0 0 1px ${$(G,60)}; transition: background 150ms ease-out, box-shadow 150ms ease-out; }
textarea.oc-sdk-input { height: auto; padding: 8px 12px; resize: vertical; }
.oc-sdk-input::placeholder { color: ${m}; }
.oc-sdk-input:hover:not(:focus) { background: ${_o}; }
.oc-sdk-input:focus, .oc-sdk-input:focus-visible { box-shadow: inset 0 0 0 2px ${Wo}; }
.oc-sdk-field[data-invalid="true"] .oc-sdk-input { box-shadow: inset 0 0 0 1px ${l("status-error","red")}; }
.oc-sdk-field[data-invalid="true"] .oc-sdk-input:focus { box-shadow: inset 0 0 0 2px ${l("status-error","red")}; }
.oc-sdk-input[data-mono="true"] { font-family: ${io}; }

.oc-sdk-search { position: relative; min-width: 0; }
.oc-sdk-search .oc-sdk-input { padding-left: 34px; padding-right: 34px; }
.oc-sdk-search-icon { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: ${m}; pointer-events: none; }
.oc-sdk-search[data-active="true"] .oc-sdk-search-icon { color: ${S}; }
.oc-sdk-search-clear { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); display: none; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 6px; color: ${m}; }
.oc-sdk-search[data-active="true"] .oc-sdk-search-clear { display: inline-flex; }
.oc-sdk-search-clear:hover { background: ${W}; color: ${Q}; }

.oc-sdk-select { position: relative; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.oc-sdk-trigger { display: inline-flex; align-items: center; gap: 6px; width: 100%; min-width: 0; height: 32px; padding: 0 8px 0 10px; border: 1px solid ${G}; border-radius: 6px; background: transparent; font-size: 0.8125rem; text-align: left; transition: background 150ms ease-out; }
.oc-sdk-trigger:hover { background: ${W}; }
.oc-sdk-trigger[aria-expanded="true"] { background: ${eo}; }
.oc-sdk-trigger-value { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-trigger-value[data-empty="true"] { color: ${m}; }
.oc-sdk-trigger-chevron { flex: 0 0 auto; color: ${m}; }
.oc-sdk-popup { position: fixed; z-index: 50; display: flex; flex-direction: column; gap: 2px; min-width: 160px; max-width: calc(100vw - 16px); max-height: min(320px, calc(100vh - 16px)); overflow: auto; padding: 4px; border: 1px solid ${$(G,60)}; border-radius: 12px; background: ${K}; color: ${Ko}; box-shadow: 0 8px 24px ${$(Q,12)}; }
.oc-sdk-popup-search { flex: 0 0 auto; padding: 2px 2px 4px; }
.oc-sdk-popup-search .oc-sdk-input { height: 32px; font-size: 0.8125rem; }
.oc-sdk-option { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; border-radius: 8px; font-size: 0.8125rem; text-align: left; }
.oc-sdk-option[data-active="true"] { background: ${W}; }
.oc-sdk-option[aria-selected="true"] { background: ${Yo}; color: ${Qo}; }
.oc-sdk-option[data-destructive="true"] { color: ${l("status-error","red")}; }
.oc-sdk-option[data-destructive="true"][data-active="true"] { background: ${$(l("status-error","red"),10)}; }
.oc-sdk-option-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-option-hint { flex: 0 0 auto; font-size: 0.75rem; color: ${m}; }
.oc-sdk-option-check { flex: 0 0 auto; width: 12px; }
.oc-sdk-popup-empty { padding: 8px; font-size: 0.8125rem; color: ${m}; }

.oc-sdk-check { display: inline-flex; align-items: flex-start; gap: 8px; width: 100%; text-align: left; }
.oc-sdk-check-box { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; margin-top: 3px; border: 1px solid ${G}; border-radius: 4px; color: ${S}; transition: border-color 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-box { border-color: ${$(S,65,G)}; }
.oc-sdk-check-box > svg { display: none; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-box > svg { display: block; }
.oc-sdk-check-thumb { flex: 0 0 auto; position: relative; width: 36px; height: 20px; border-radius: 9999px; background: ${G}; transition: background 150ms ease-out; }
.oc-sdk-check-thumb::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 9999px; background: ${j}; transition: transform 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb { background: ${S}; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb::after { transform: translateX(16px); }
.oc-sdk-check:focus-visible { box-shadow: none; }
.oc-sdk-check:focus-visible .oc-sdk-check-box, .oc-sdk-check:focus-visible .oc-sdk-check-thumb { ${Zo} }
.oc-sdk-check-text { display: flex; flex-direction: column; min-width: 0; }
.oc-sdk-check-label { font-size: 0.875rem; }
.oc-sdk-check-desc { font-size: 0.75rem; color: ${m}; }

.oc-sdk-tabs { display: inline-flex; gap: 2px; padding: 2px; border-radius: 10px; max-width: 100%; overflow: auto; }
.oc-sdk-tabs[data-track="true"] { background: ${$(Q,4)}; }
.oc-sdk-tab { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border: 1px solid transparent; border-radius: 8px; font-size: 0.8125rem; font-weight: 500; color: ${m}; white-space: nowrap; transition: color 150ms ease-out, background 150ms ease-out; }
.oc-sdk-tab:hover { color: ${Q}; }
.oc-sdk-tab[aria-selected="true"] { color: ${Q}; background: ${K}; border-color: ${$(Q,7)}; box-shadow: 0 1px 2px ${$(Q,6)}; }
.oc-sdk-tab-count { font-size: 0.75rem; font-variant-numeric: tabular-nums; color: ${m}; }

.oc-sdk-badge { display: inline-flex; align-items: center; padding: 1px 6px; border-radius: 9999px; font-size: 11px; font-weight: 500; line-height: 16px; white-space: nowrap; background: ${W}; color: ${m}; }
.oc-sdk-badge[data-tone] { color: var(--oc-sdk-tone); background: ${$("var(--oc-sdk-tone)",15)}; }

.oc-sdk-list { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.oc-sdk-row { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; border-radius: 6px; text-align: left; transition: background 120ms ease-out; }
.oc-sdk-row:hover, .oc-sdk-row[data-active="true"] { background: ${W}; }
.oc-sdk-row[aria-selected="true"] { background: ${Yo}; color: ${Qo}; }
.oc-sdk-row-lead { flex: 0 0 auto; width: 64px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: ${io}; font-size: 0.75rem; color: ${m}; }
.oc-sdk-row-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
.oc-sdk-row-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-row-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem; color: ${m}; }
.oc-sdk-row-meta { flex: 0 0 auto; font-size: 0.75rem; font-variant-numeric: tabular-nums; color: ${m}; }
.oc-sdk-row[aria-selected="true"] .oc-sdk-row-lead, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-sub, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-meta { color: inherit; opacity: .75; }
.oc-sdk-list-empty { padding: 16px 8px; text-align: center; font-size: 0.8125rem; color: ${m}; }

.oc-sdk-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding: 40px 16px; text-align: center; }
.oc-sdk-empty-title { margin: 0; font-size: 0.8125rem; font-weight: 600; }
.oc-sdk-empty-body { margin: 0; max-width: 32rem; font-size: 0.8125rem; color: ${m}; }
.oc-sdk-empty-action { margin-top: 12px; }

@keyframes oc-sdk-spin { to { transform: rotate(360deg); } }
.oc-sdk-spinner { display: inline-flex; align-items: center; gap: 8px; font-size: 0.8125rem; color: ${m}; }
.oc-sdk-spinner-ring { width: 16px; height: 16px; border: 2px solid ${G}; border-top-color: ${S}; border-radius: 9999px; animation: oc-sdk-spin .8s linear infinite; }
.oc-sdk-spinner[data-size="sm"] .oc-sdk-spinner-ring { width: 12px; height: 12px; }

.oc-sdk-banner { display: flex; align-items: flex-start; gap: 12px; padding: 8px 12px; border: 1px solid ${$("var(--oc-sdk-tone)",40)}; border-radius: 8px; background: ${$("var(--oc-sdk-tone)",10)}; }
.oc-sdk-banner-text { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.oc-sdk-banner-title { font-size: 0.8125rem; font-weight: 500; color: var(--oc-sdk-tone); }
.oc-sdk-banner-body { font-size: 0.8125rem; color: ${m}; }
.oc-sdk-banner-action { flex: 0 0 auto; }

.oc-sdk-separator { display: flex; align-items: center; gap: 8px; width: 100%; margin: 8px 0; font-size: 0.75rem; color: ${m}; }
.oc-sdk-separator::before, .oc-sdk-separator::after { content: ""; flex: 1 1 auto; height: 1px; background: ${$(G,40)}; }
.oc-sdk-separator[data-labeled="false"]::after { display: none; }
.oc-sdk-popup > .oc-sdk-separator { margin: 4px 0; }

.oc-sdk-progress { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.oc-sdk-progress-label { display: flex; justify-content: space-between; font-size: 0.75rem; color: ${m}; font-variant-numeric: tabular-nums; }
.oc-sdk-progress-track { height: 6px; border-radius: 9999px; background: ${G}; overflow: hidden; }
.oc-sdk-progress-fill { height: 100%; border-radius: 9999px; background: var(--oc-sdk-tone, ${S}); transform-origin: left; transition: transform 200ms ease-out; }

.oc-sdk-menu { position: relative; display: inline-flex; }

.oc-sdk-text { white-space: pre-wrap; overflow-wrap: anywhere; }
.oc-sdk-text a { color: ${S}; text-decoration: underline; text-underline-offset: 2px; }
.oc-sdk-text img { display: block; max-width: 100%; margin: 8px 0; border-radius: 8px; border: 1px solid ${$(G,60)}; }
`;var Oo=()=>{let o=document.createElement("span");return o.className="oc-sdk-spinner-ring",o.setAttribute("aria-hidden","true"),o},J=(o,t)=>{w(g);let c=t,a=Z("oc-sdk oc-sdk-btn"),p=Oo(),e=document.createElement("span");a.append(e),o.append(a);let i=()=>{if(a.dataset.variant=c.variant??"default",a.dataset.size=c.size??"default",a.disabled=Boolean(c.disabled)||Boolean(c.loading),a.dataset.loading=c.loading?"true":"false",a.setAttribute("aria-busy",c.loading?"true":"false"),c.loading&&p.parentNode!==a)a.prepend(p);else if(!c.loading&&p.parentNode===a)p.remove();z(e,c.label)},n=()=>{if(c.disabled||c.loading)return;c.onClick()};return a.addEventListener("click",n),i(),{update:(h)=>{c={...c,...h},i()},dispose:()=>{a.removeEventListener("click",n),a.remove()}}};var po=(o,t)=>{w(g);let c=t,a=s("label","oc-sdk oc-sdk-field"),p=s("span","oc-sdk-field-label"),e=c.multiline?s("textarea","oc-sdk-input"):s("input","oc-sdk-input"),i=s("span","oc-sdk-field-note");a.append(p,e,i),o.append(a);let n=()=>{if(z(p,c.label),p.hidden=!c.label,e instanceof HTMLInputElement)e.type=c.password?"password":"text";else e.rows=c.rows??3;if(e.value!==c.value)e.value=c.value;e.disabled=Boolean(c.disabled),C(e,"placeholder",c.placeholder),e.dataset.mono=c.mono?"true":"false";let b=Boolean(c.error);a.dataset.invalid=b?"true":"false",e.setAttribute("aria-invalid",b?"true":"false");let y=c.error??c.helper??"";z(i,y),i.hidden=y===""},h=()=>{c.onChange(e.value)};return e.addEventListener("input",h),n(),{update:(b)=>{c={...c,...b},n()},dispose:()=>{e.removeEventListener("input",h),a.remove()}}};var so=(o,t)=>{C(o,"data-tone",t&&t!=="neutral"?t:null)},ko=(o,t)=>{w(g);let c=t,a=s("span","oc-sdk oc-sdk-badge");o.append(a);let p=()=>{z(a,c.label),so(a,c.tone)};return p(),{update:(e)=>{c={...c,...e},p()},dispose:()=>{a.remove()}}};var No=/(!?)\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g,Ro=(o)=>{try{let t=new URL(o);return t.protocol==="http:"||t.protocol==="https:"}catch{return!1}},jo=(o)=>{let t=[],c=0;for(let a of o.matchAll(No)){let p=a.index??0;if(p>c)t.push({kind:"text",text:o.slice(c,p)});let e=a[1]??"",i=(a[2]??"").trim(),n=a[3]??"";if(!Ro(n))t.push({kind:"text",text:a[0]});else if(e==="!")t.push({kind:"image",src:n,alt:i});else t.push({kind:"link",href:n,label:i||n});c=p+a[0].length}if(c<o.length)t.push({kind:"text",text:o.slice(c)});return t},fo=(o,t)=>{w(g);let c=t,a=s("div","oc-sdk oc-sdk-text");o.append(a);let p=(i)=>{if(!(i.target instanceof HTMLAnchorElement)||!c.onOpenUrl)return;i.preventDefault(),c.onOpenUrl(i.target.href)},e=()=>{I(a);for(let i of jo(c.text))if(i.kind==="text")a.append(document.createTextNode(i.text));else if(i.kind==="link"){let n=s("a");n.href=i.href,n.rel="noopener noreferrer",n.target="_blank",n.textContent=i.label,a.append(n)}else{let n=s("img");n.src=i.src,n.alt=i.alt,n.loading="lazy",n.referrerPolicy="no-referrer",a.append(n)}};return a.addEventListener("click",p),e(),{update:(i)=>{c={...c,...i},e()},dispose:()=>{a.removeEventListener("click",p),a.remove()}}};var D=ao(),V=document.querySelector("#root");if(!V)throw Error("no root");D.onReady((o)=>{no(o,document.documentElement);while(V.firstChild)V.removeChild(V.firstChild);let t=document.createElement("div");t.style.padding="12px",t.style.display="flex",t.style.flexDirection="column",t.style.gap="10px",V.append(t);let c=document.createElement("div");c.style.display="flex",c.style.gap="8px",c.style.alignItems="center",t.append(c);let a=ko(c,{label:"service: unknown"}),p=async()=>{let b=await D.serviceStatus(),y=b.status==="ready"?"success":b.status==="failed"?"error":"neutral";a.update({label:`service: ${b.status}`,tone:y})};J(c,{label:"Refresh status",size:"sm",variant:"ghost",onClick:()=>void p().catch(()=>{})});let e="hello from the panel";po(t,{label:"Message to echo",value:e,onChange:(b)=>{e=b}});let i=fo(t,{text:"No calls yet. The first request spawns the service process (needs approval)."}),n=async(b,y)=>{try{let k=await y();i.update({text:`${b} → HTTP ${k.status}
${k.body}`})}catch(k){i.update({text:`${b} failed: ${k instanceof T?`${k.code} ${k.message}`:String(k)}`})}await p().catch(()=>{})},h=document.createElement("div");h.style.display="flex",h.style.gap="8px",h.style.flexWrap="wrap",t.append(h),J(h,{label:"Echo (POST)",onClick:()=>void n("POST /echo",()=>D.serviceRequest({method:"POST",path:"/echo",query:{via:"panel"},body:JSON.stringify({message:e})}))}),J(h,{label:"uname -a",variant:"outline",onClick:()=>void n("GET /uname",()=>D.serviceRequest({method:"GET",path:"/uname"}))}),J(h,{label:"Bad path",variant:"ghost",onClick:()=>void n("GET ../x",()=>D.serviceRequest({method:"GET",path:"/../x"}))}),p().catch(()=>{})});})();
