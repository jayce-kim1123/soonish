export default function ErrorNote({ message }: { message: string | null }) {
  return message ? <p className="error">{message}</p> : null;
}
