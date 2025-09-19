import Spinner from "./spinner";

export function FullPageSpinner() {
  return (
    <div className="flex size-full">
      <div className="m-auto">
        <Spinner />
      </div>
    </div>
  );
}
