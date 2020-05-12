import {Container} from "./cli/Container";

const container = new Container();

container
  .getCommand(process.argv[2])
  .then(c => {
    console.log(new Date());
    return c.run(process.argv);
  })
  .then(x => console.log(new Date()))
  .catch(console.error);
