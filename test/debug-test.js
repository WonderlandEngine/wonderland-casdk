import assert from 'assert';
import {WLCASDK} from '../wonderland-casdk.js';

describe('WLCASDK', function() {
    describe('#init', function() {
        it('should set gameId', function() {
            WLCASDK.init(true, 'test')
            assert.strictEqual(WLCASDK.gameId, 'test');
        });
    });

    describe('#login', function() {

        it('should call loginStatusChangeCallbacks', async function() {
            let calledA = false;
            let calledB = false;

            WLCASDK.loginStatusChangeCallbacks.push((u) => {
                calledA = u;
            });
            WLCASDK.loginStatusChangeCallbacks.push((u) => {
                calledB = u;
            });

            WLCASDK.init(true, 'test')
            /* Should call the callbacks here */
            assert(await WLCASDK.login());

            assert(calledA);
            assert(calledB);
        });

    });

    describe('#getUser', function() {

        it('should call userUpdateCallbacks', async function() {
            let calledA = false;
            let calledB = false;

            WLCASDK.userUpdateCallbacks.push((u) => {
                calledA = u;
            });
            WLCASDK.userUpdateCallbacks.push((u) => {
                calledB = u;
            });

            WLCASDK.init(true, 'test')
            assert(await WLCASDK.login());

            const user = await WLCASDK.getUser();
            assert.strictEqual(user.displayName, 'WonderfulUser');

            assert(calledA);
            assert(calledB);
        });

    });
});
