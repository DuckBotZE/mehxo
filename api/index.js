export const config = {
  runtime: "edge",
};

const primaryHost = resolveHost(process.env.TARGET_DOMAIN);

const OMITTED_FIELDS = new Set([
  "connection",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "forwarded",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
]);

function resolveHost(value = "") {
  return value.trim().replace(/\/+$/, "");
}

function createEndpointAddress(originalUrl) {
  const details = new URL(originalUrl);
  return `${primaryHost}${details.pathname}${details.search}`;
}

function shouldOmitField(fieldName) {
  return OMITTED_FIELDS.has(fieldName) || fieldName.startsWith("x-vercel-");
}

function mapRequestFields(fields) {
  const mappedFields = new Headers();
  let originAddress = "";

  fields.forEach((value, key) => {
    const fieldName = key.toLowerCase();

    if (shouldOmitField(fieldName)) {
      return;
    }

    if (fieldName === "x-real-ip") {
      originAddress = value;
      return;
    }

    if (fieldName === "x-forwarded-for") {
      originAddress ||= value;
      return;
    }

    mappedFields.set(key, value);
  });

  if (originAddress) {
    mappedFields.set("x-forwarded-for", originAddress);
  }

  return mappedFields;
}

function canAttachStream(action) {
  return action !== "GET" && action !== "HEAD";
}

export default async function execute(request) {
  if (!primaryHost) {
    return new Response("Missing required application setting.", {
      status: 500,
    });
  }

  const action = request.method;

  try {
    const endpointAddress = createEndpointAddress(request.url);

    const requestOptions = {
      method: action,
      headers: mapRequestFields(request.headers),
      redirect: "manual",
      duplex: "half",
    };

    if (canAttachStream(action)) {
      requestOptions.body = request.body;
    }

    return await fetch(endpointAddress, requestOptions);
  } catch (error) {
    console.error("Execution failed:", error);

    return new Response("Request execution failed.", {
      status: 502,
    });
  }
}
