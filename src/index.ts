import { z, ZodTypeAny } from "zod";

// ------------------ Core Types ------------------
type Proxiable = object | any[];
type BlobLike = Blob | File;

// ------------------ Type Guards ------------------
function isProxiable(value: unknown): value is Proxiable {
  return typeof value === "object" && value !== null;
}

function isBlobLike(value: unknown): value is BlobLike {
  return value instanceof Blob || value instanceof File;
}

// ------------------ Proxy Setup ------------------
const handler: ProxyHandler<Proxiable> = {
  set(target, property, value) {
    const newValue =
      isProxiable(value) && !isBlobLike(value)
        ? createDeepProxy(value, handler)
        : value;
    Reflect.set(target, property, newValue);
    return true;
  },
};

function createDeepProxy<T extends Proxiable>(
  target: T,
  handler: ProxyHandler<T>
): T {
  for (const key of Object.keys(target)) {
    const value = (target as any)[key];
    if (isProxiable(value) && !isBlobLike(value)) {
      (target as any)[key] = createDeepProxy(value, handler);
    }
  }
  return new Proxy(target, handler);
}

// ------------------ Schema Inference ------------------
function inferSchema<T>(data: T): z.ZodType<T> {
  if (Array.isArray(data)) {
    const elementTypes: z.ZodTypeAny[] = [];

    for (const item of data) {
      if (isProxiable(item) && !isBlobLike(item)) {
        elementTypes.push(inferSchema(item));
      } else if (isBlobLike(item)) {
        elementTypes.push(z.instanceof(Blob));
      } else if (typeof item === "string") {
        elementTypes.push(z.string());
      } else if (typeof item === "number") {
        elementTypes.push(z.number());
      } else if (typeof item === "boolean") {
        elementTypes.push(z.boolean());
      } else if (item === null) {
        elementTypes.push(z.null());
      } else if (item === undefined) {
        elementTypes.push(z.undefined());
      } else {
        elementTypes.push(z.unknown());
      }
    }

    return z.array(
      elementTypes.length > 0
        ? z.union(elementTypes as [ZodTypeAny, ZodTypeAny, ...ZodTypeAny[]])
        : z.unknown()
    ) as unknown as z.ZodType<T>;
  } else if (isProxiable(data) && !isBlobLike(data)) {
    const shape: Record<string, z.ZodTypeAny> = {};

    for (const key of Object.keys(data)) {
      const value = (data as any)[key];
      if (isProxiable(value) && !isBlobLike(value)) {
        shape[key] = inferSchema(value);
      } else if (isBlobLike(value)) {
        shape[key] = z.instanceof(Blob);
      } else if (typeof value === "string") {
        shape[key] = z.string();
      } else if (typeof value === "number") {
        shape[key] = z.number();
      } else if (typeof value === "boolean") {
        shape[key] = z.boolean();
      } else if (value === null) {
        shape[key] = z.null();
      } else if (value === undefined) {
        shape[key] = z.undefined();
      } else {
        shape[key] = z.unknown();
      }
    }

    return z.object(shape) as unknown as z.ZodType<T>;
  } else if (isBlobLike(data)) {
    return z.instanceof(Blob) as unknown as z.ZodType<T>;
  } else {
    return z.unknown() as unknown as z.ZodType<T>;
  }
}

// ------------------ FormData Serialization ------------------
function appendToFormData(formData: FormData, data: any, parentKey = ""): void {
  if (Array.isArray(data)) {
    data.forEach((value, index) => {
      const key = parentKey ? `${parentKey}[${index}]` : `${index}`;
      if (isProxiable(value) && !isBlobLike(value)) {
        appendToFormData(formData, value, key);
      } else if (isBlobLike(value)) {
        formData.append(key, value);
      } else {
        formData.append(key, String(value));
      }
    });
  } else if (isProxiable(data) && !isBlobLike(data)) {
    for (const [key, value] of Object.entries(data)) {
      const newKey = parentKey ? `${parentKey}[${key}]` : key;
      if (isProxiable(value) && !isBlobLike(value)) {
        appendToFormData(formData, value, newKey);
      } else if (isBlobLike(value)) {
        formData.append(newKey, value);
      } else {
        formData.append(newKey, String(value));
      }
    }
  } else if (isBlobLike(data)) {
    if (parentKey) {
      formData.append(parentKey, data);
    }
  } else {
    if (parentKey) {
      formData.append(parentKey, String(data));
    }
  }
}

// ------------------ Main API ------------------
export function frmz<T extends Proxiable>(
  initialData: T
): {
  data: T;
  getFormData: () => FormData;
};

export function frmz<T extends ZodTypeAny>(
  initialData: z.infer<T>,
  schema: T
): {
  data: z.infer<T>;
  getFormData: () => FormData;
};

export function frmz<T extends Proxiable>(
  initialData: T,
  schema?: ZodTypeAny
): {
  data: any;
  getFormData: () => FormData;
} {
  if (!isProxiable(initialData)) {
    throw new Error(
      "createFormDataManager only supports object and array root types"
    );
  }

  const actualSchema = schema || inferSchema(initialData);
  const parsed = actualSchema.parse(initialData);
  const data = createDeepProxy(structuredClone(parsed), handler);

  const getFormData = () => {
    const formData = new FormData();
    appendToFormData(formData, data);
    return formData;
  };

  return {
    data,
    getFormData,
  };
}

// ------------------ Utility Type ------------------
export type DeepWritable<T> = {
  -readonly [K in keyof T]: T[K] extends object ? DeepWritable<T[K]> : T[K];
};
