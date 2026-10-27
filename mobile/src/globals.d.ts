// React Native's FormData also takes a file by its URI on the device, which
// the DOM typings (used for the web build) don't know about.
interface FormData {
  append(name: string, value: { uri: string; name?: string; type?: string }): void;
}
