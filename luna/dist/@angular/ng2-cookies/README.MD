

# ng2-cookies

Simple library to deal with cookies in Angular2.

## Installation

To install this library, run:

```bash
$ npm install ng2-cookies
```

Usage:

```typescript
import { Cookie } from 'ng2-cookies/ng2-cookies';

Cookie.set('cookieName', 'cookieValue');
Cookie.set('cookieName', 'cookieValue', 10 /*days from now*/);
Cookie.set('cookieName', 'cookieValue', 10, '/myapp/', 'mydomain.com', true /* https only */ );

let myCookie = Cookie.get('cookieName');

/*
* List of cookies as Object, like: { cookieName: "cookieValue", cookieName2: "cookieValue2" ... etc }
*/
let cookielist = Cookie.getAll();

Cookie.delete('cookieName');
Cookie.deleteAll();

```


# Contributors
[<img alt="carcamano" src="https://avatars.githubusercontent.com/u/11354012?v=3&s=117" width="117">](https://github.com/carcamano) |[<img alt="Bigous" src="https://avatars.githubusercontent.com/u/6886560?v=3&s=117" width="117">](https://github.com/bigous) |
:---: |:---: |
[Carcamano](https://github.com/carcamano) |[Bigous](https://github.com/bigous) |


## License
MIT © [Felipe Rebelo Lopes](http://github.com/carcamano)

