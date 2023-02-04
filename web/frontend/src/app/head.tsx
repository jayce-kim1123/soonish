// app 디렉터리에서는 <head> 안의 내용을 head.tsx 에 적는다.
export default function Head() {
  return (
    <>
      <title>Soonish</title>
      <meta name="description" content="가벼운 이슈 트래커" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
    </>
  );
}
