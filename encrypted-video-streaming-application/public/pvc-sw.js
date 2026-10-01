const CLIENT_PORT_MAP = new Map();

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('message', async (event) => {
  if (event.data.type === 'REGISTER_CLIENT') {
    // Prune stale entries
    if (CLIENT_PORT_MAP.size > 50) {
      const activeClients = await self.clients.matchAll();
      const activeIds = new Set(activeClients.map(c => c.id));
      // Cross-referencing logical clientId with browser-assigned client.id
      // For now, if we have too many, we just clear and let them re-register
      CLIENT_PORT_MAP.clear();
    }
    
    CLIENT_PORT_MAP.set(event.data.clientId, event.ports[0]);
    event.ports[0].onmessage = (e) => {
      if (e.data.type === 'CANCEL_REQUEST') {
        // Handle stream cancellation
      }
    };
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/pvc-stream/')) {
    const clientId = url.pathname.split('/')[2];
    event.respondWith(handleRangeRequest(clientId, event.request));
  }
});

async function handleRangeRequest(clientId, request) {
  let port = CLIENT_PORT_MAP.get(clientId);
  
  if (!port) {
    // Attempt to recover by looking for any active client that might be this one
    const clients = await self.clients.matchAll();
    if (clients.length > 0) {
      // Prune dead ports if map is large
      if (CLIENT_PORT_MAP.size > 20) CLIENT_PORT_MAP.clear();
    }
    return new Response('Pipeline Context Lost. Refresh Required.', { status: 503 });
  }

  const range = request.headers.get('Range');
  let start = 0, end = null;
  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    start = parseInt(parts[0], 10);
    end = parts[1] ? parseInt(parts[1], 10) : null;
  }

  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timeout = setTimeout(() => {
      resolve(new Response('Source Stream Timeout', { status: 504 }));
    }, 10000);

    channel.port1.onmessage = (e) => {
      if (e.data.type === 'DATA_START') {
        clearTimeout(timeout);
        const { totalSize, contentType } = e.data;
        const actualEnd = end !== null ? end : totalSize - 1;
        const contentLength = actualEnd - start + 1;

        const stream = new ReadableStream({
          start(controller) {
            channel.port1.onmessage = (msg) => {
              if (msg.data.type === 'DATA_CHUNK') {
                controller.enqueue(msg.data.chunk);
              } else if (msg.data.type === 'DATA_END') {
                controller.close();
              } else if (msg.data.type === 'DATA_ERROR') {
                controller.error(msg.data.error);
              }
            };
          }
        });

        resolve(new Response(stream, {
          status: range ? 206 : 200,
          statusText: range ? 'Partial Content' : 'OK',
          headers: {
            'Content-Type': contentType,
            'Accept-Ranges': 'bytes',
            'Content-Length': contentLength.toString(),
            'Content-Range': `bytes ${start}-${actualEnd}/${totalSize}`,
            'Cache-Control': 'no-store'
          }
        }));
      }
    };

    port.postMessage({ type: 'REQUEST_DATA', start, end }, [channel.port2]);
  });
}
