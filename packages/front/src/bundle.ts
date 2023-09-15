import _ from 'lodash';
import './style.css';
import printMe from './print';

function component() {
  const element = document.createElement('div');
  const button = document.createElement('button');

  // Lodash, currently included via a script, is required for this line to work
  element.innerHTML = _.join(['Hello', 'webpack'], ' ');
  button.innerHTML = 'Bonjour cliquer moi';
  button.onclick = printMe;

  element.appendChild(button);

  return element;
}

document.body.appendChild(component());
