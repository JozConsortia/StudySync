// The user's initials in a circle.
export default function Avatar({ user }) {
  const initials = user.fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

  return (
    <span className="avatar avatar-initials" aria-hidden="true">
      {initials || "?"}
    </span>
  );
}
