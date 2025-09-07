export function tap<T>(t: T, cb: (t: T) => void): T {
  cb(t);
  return t;
}

export function debugPrint<T>(t: T): T {
  return tap(t, (t) => {
    console.log(t);
  });
}
